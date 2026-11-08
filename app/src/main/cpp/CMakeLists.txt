cmake_minimum_required(VERSION 3.22.1)
project(opengateway_launcher C)

add_library(launcher SHARED native_launcher.c)
find_library(log-lib log)
target_link_libraries(launcher ${log-lib})
