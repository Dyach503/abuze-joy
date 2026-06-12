#pragma once

#include <signal.h>

#ifdef __linux__
#define HAS_FILTER_SSID 1
#endif

#ifdef __CYGWIN__
extern volatile sig_atomic_t bQuit;
#endif
int main(int argc, char *argv[]);

// when something changes that can break LUA compatibility this version should be increased
#define LUA_COMPAT_VER	5
