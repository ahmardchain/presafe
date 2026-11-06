/*
 * Test-only LD_PRELOAD shim for containers whose open-files hard limit is below 65535.
 * near-sandbox (neard) insists on raising RLIMIT_NOFILE to 65535 at startup and exits if it
 * cannot. This shim clamps that request to the current hard limit and reports 65535 back.
 * The sandbox is configured with max_open_files = 3000, far below either limit.
 * Used only by run-tests.sh, and only when `ulimit -Hn` < 65535. Never used in production.
 */
#define _GNU_SOURCE
#include <dlfcn.h>
/* Declared here instead of <sys/resource.h> to avoid clashing with glibc's prototypes.
 * Linux x86_64: rlim_t is unsigned long and RLIMIT_NOFILE is 7. */
typedef unsigned long rlim_t;
struct rlimit { rlim_t rlim_cur; rlim_t rlim_max; };
#define RLIMIT_NOFILE 7

#define WANT 65535

typedef int (*set_fn)(int, const struct rlimit *);
typedef int (*get_fn)(int, struct rlimit *);

static int clamp_set(const char *name, int res, const struct rlimit *rl) {
    set_fn real = (set_fn)dlsym(RTLD_NEXT, name);
    if (res != RLIMIT_NOFILE) return real(res, rl);
    get_fn get = (get_fn)dlsym(RTLD_NEXT, "getrlimit");
    struct rlimit cur, want = *rl;
    if (get(RLIMIT_NOFILE, &cur) == 0) {
        if (want.rlim_max > cur.rlim_max) want.rlim_max = cur.rlim_max;
        if (want.rlim_cur > want.rlim_max) want.rlim_cur = want.rlim_max;
    }
    return real(res, &want);
}

static int report_get(const char *name, int res, struct rlimit *rl) {
    get_fn real = (get_fn)dlsym(RTLD_NEXT, name);
    int r = real(res, rl);
    if (r == 0 && res == RLIMIT_NOFILE) {
        if (rl->rlim_cur < WANT) rl->rlim_cur = WANT;
        if (rl->rlim_max < WANT) rl->rlim_max = WANT;
    }
    return r;
}

int setrlimit(int res, const struct rlimit *rl) { return clamp_set("setrlimit", res, rl); }
int setrlimit64(int res, const struct rlimit *rl) { return clamp_set("setrlimit64", res, rl); }
int getrlimit(int res, struct rlimit *rl) { return report_get("getrlimit", res, rl); }
int getrlimit64(int res, struct rlimit *rl) { return report_get("getrlimit64", res, rl); }
