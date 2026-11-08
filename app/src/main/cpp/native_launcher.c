#define _GNU_SOURCE
#include <jni.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <sys/poll.h>
#include <fcntl.h>
#include <unistd.h>
#include <string.h>
#include <errno.h>
#include <signal.h>
#include <stdlib.h>

#define MAX_ARGS 64

static int copyToMemfd(const char *path, const char *name, int *outFd) {
    int src = open(path, O_RDONLY);
    if (src < 0) return -1;
    int dst = memfd_create(name, 0);
    if (dst < 0) { close(src); return -1; }
    if (fchmod(dst, 0755) != 0) { close(src); close(dst); return -1; }
    static char buf[1 << 20];
    ssize_t r;
    while ((r = read(src, buf, sizeof buf)) > 0) {
        ssize_t w = 0;
        while (w < r) {
            ssize_t n = write(dst, buf + w, (size_t)(r - w));
            if (n <= 0) { close(src); close(dst); return -1; }
            w += n;
        }
    }
    close(src);
    if (r != 0) { close(dst); return -1; }
    *outFd = dst;
    return 0;
}

static char *xstrdup(const char *s) {
    size_t n = strlen(s) + 1;
    char *p = (char *)malloc(n);
    if (p) memcpy(p, s, n);
    return p;
}

JNIEXPORT jstring JNICALL Java_com_opengateway_app_MemfdRunner_execAndCapture(
    JNIEnv *env, jclass clazz,
    jstring loaderPath, jstring binaryPath,
    jobjectArray argsArray, jobjectArray envArray)
{
    const char *loader = (*env)->GetStringUTFChars(env, loaderPath, NULL);
    const char *binary = (*env)->GetStringUTFChars(env, binaryPath, NULL);
    if (!loader || !binary) {
        if (loader) (*env)->ReleaseStringUTFChars(env, loaderPath, loader);
        if (binary) (*env)->ReleaseStringUTFChars(env, binaryPath, binary);
        return (*env)->NewStringUTF(env, "exit=1\n[memfd] bad path args\n");
    }

    int loaderFd = -1, binaryFd = -1;
    if (copyToMemfd(loader, "ld-musl-exec", &loaderFd) != 0 ||
        copyToMemfd(binary, "opencode-exec", &binaryFd) != 0) {
        (*env)->ReleaseStringUTFChars(env, loaderPath, loader);
        (*env)->ReleaseStringUTFChars(env, binaryPath, binary);
        return (*env)->NewStringUTF(env, "exit=1\n[memfd] failed to stage binary into memory (memfd fallback)\n");
    }
    (*env)->ReleaseStringUTFChars(env, loaderPath, loader);
    (*env)->ReleaseStringUTFChars(env, binaryPath, binary);

    int pipefd[2];
    if (pipe(pipefd) != 0) {
        close(loaderFd); close(binaryFd);
        return (*env)->NewStringUTF(env, "exit=1\n[memfd] pipe failed\n");
    }

    pid_t pid = fork();
    if (pid < 0) {
        close(pipefd[0]); close(pipefd[1]); close(loaderFd); close(binaryFd);
        return (*env)->NewStringUTF(env, "exit=1\n[memfd] fork failed\n");
    }

    if (pid == 0) {
        /* child */
        close(pipefd[0]);
        dup2(pipefd[1], STDOUT_FILENO);
        dup2(pipefd[1], STDERR_FILENO);
        if (pipefd[1] > STDERR_FILENO) close(pipefd[1]);

        extern char **environ;
        /* Build argv: [loaderMemfdPath, binaryMemfdPath, userArgs...] */
        char loaderMemfd[64], binaryMemfd[64];
        snprintf(loaderMemfd, sizeof loaderMemfd, "/proc/self/fd/%d", loaderFd);
        snprintf(binaryMemfd, sizeof binaryMemfd, "/proc/self/fd/%d", binaryFd);

        jsize nArgs = (*env)->GetArrayLength(env, argsArray);
        char *argv[MAX_ARGS + 2];
        int i = 0;
        argv[i++] = loaderMemfd;
        argv[i++] = binaryMemfd;
        for (jsize j = 0; j < nArgs && i < MAX_ARGS; j++) {
            jstring s = (jstring)(*env)->GetObjectArrayElement(env, argsArray, j);
            const char *cs = (*env)->GetStringUTFChars(env, s, NULL);
            argv[i++] = xstrdup(cs ? cs : "");
            (*env)->ReleaseStringUTFChars(env, s, cs);
            (*env)->DeleteLocalRef(env, s);
        }
        argv[i] = NULL;

        char **envp;
        jsize nEnv = (*env)->GetArrayLength(env, envArray);
        if (nEnv > 0) {
            envp = (char **)malloc(sizeof(char *) * (nEnv + 1));
            for (jsize j = 0; j < nEnv; j++) {
                jstring s = (jstring)(*env)->GetObjectArrayElement(env, envArray, j);
                const char *cs = (*env)->GetStringUTFChars(env, s, NULL);
                envp[j] = xstrdup(cs ? cs : "");
                (*env)->ReleaseStringUTFChars(env, s, cs);
                (*env)->DeleteLocalRef(env, s);
            }
            envp[nEnv] = NULL;
        } else {
            envp = environ;
        }

        /* The loader itself is exec'd from memory (PIE, allowed).
           It then loads the opencode binary from its memfd path. */
        alarm(600); /* 10 min watchdog, like the Java side */
        fexecve(loaderFd, argv, envp);
        _exit(127);
    }

    /* parent */
    close(pipefd[1]);
    close(loaderFd); close(binaryFd);

    size_t cap = 1 << 20, len = 0;
    char *out = (char *)malloc(cap);
    char chunk[16384];
    /* overall deadline loop using poll */
    long elapsed = 0;
    int eof = 0, timedOut = 0;
    while (!eof) {
        struct pollfd pfd = { .fd = pipefd[0], .events = POLLIN };
        int r = poll(&pfd, 1, 1000);
        if (r < 0) { if (errno == EINTR) continue; break; }
        if (r == 0) {
            elapsed += 1;
            if (elapsed > 600) { timedOut = 1; kill(pid, SIGKILL); break; }
            continue;
        }
        ssize_t n = read(pipefd[0], chunk, sizeof chunk);
        if (n < 0) { if (errno == EINTR) continue; break; }
        if (n == 0) { eof = 1; break; }
        if (len + (size_t)n + 64 > cap) {
            cap = (len + (size_t)n + 64) * 2;
            char *tmp = (char *)realloc(out, cap);
            if (!tmp) break;
            out = tmp;
        }
        memcpy(out + len, chunk, (size_t)n);
        len += (size_t)n;
    }
    close(pipefd[0]);
    int status = 0;
    waitpid(pid, &status, 0);
    int exitCode = WIFEXITED(status) ? WEXITSTATUS(status) : -1;

    char header[256];
    snprintf(header, sizeof header, "exit=%d%s\n", exitCode, timedOut ? " (watchdog 600s, killed)" : "");
    size_t hdrLen = strlen(header);
    char *result = (char *)malloc(hdrLen + len + 1);
    memcpy(result, header, hdrLen);
    memcpy(result + hdrLen, out, len);
    result[hdrLen + len] = '\0';
    free(out);

    jstring ret = (*env)->NewStringUTF(env, result);
    free(result);
    return ret;
}

JNIEXPORT jboolean JNICALL Java_com_opengateway_app_MemfdRunner_available(JNIEnv *env, jclass clazz) {
    (void)env; (void)clazz;
    return JNI_TRUE;
}
