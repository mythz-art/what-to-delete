/*
 * msvc_shim.c — MSVC C++ runtime shims that allow linking WebView2LoaderStatic.lib
 * (an MSVC COFF static library) into a GNU/mingw-w64 x64 executable.
 * MSVC-mangled aliases + the TLS epoch variable live in msvc_shim.S.
 */

#include <stdint.h>
#include <stdlib.h>
#include <stddef.h>
#include <windows.h>

/* ============ /GS stack cookies ============ */

uintptr_t __security_cookie;

static void msvc_cookie_ctor(void) __attribute__((constructor));
static void msvc_cookie_ctor(void)
{
    uintptr_t aslr = (uintptr_t)&__security_cookie;
    __security_cookie = aslr ^ (aslr >> 17) ^ 0x2B992DDFA232ULL;
    if (__security_cookie == 0)
        __security_cookie = 0x2B992DDFA232ULL;
}

void __cdecl __security_check_cookie(uintptr_t cookie)
{
    if (__builtin_expect(cookie != __security_cookie, 0)) {
        for (;;)
            __asm__ volatile("int3"); /* stack corruption — trap */
    }
}

/* ============ magic statics (_Init_thread_*) ============ */

/* Defined in msvc_shim.S inside .tls$wtd (native COFF TLS). */
extern unsigned long _Init_thread_epoch;
/* Provided by mingw-w64 CRT. */
extern unsigned long _tls_index;
extern unsigned char ___tls_start__[];

/* Address of the current thread's instance of _Init_thread_epoch.
 * Same mechanism as MSVC codegen: TEB.ThreadLocalStoragePointer[_tls_index]
 * + (template offset of the symbol). */
static volatile unsigned long *epoch_slot(void)
{
    void **tls_array;
    __asm__ volatile("mov %%gs:0x58, %0" : "=r"(tls_array));
    unsigned char *blk = (unsigned char *)tls_array[_tls_index];
    size_t off = (uintptr_t)&_Init_thread_epoch - (uintptr_t)___tls_start__;
    return (volatile unsigned long *)(blk + off);
}

static volatile unsigned long g_epoch = 0;
static CRITICAL_SECTION g_cs;

static void msvc_cs_ctor(void) __attribute__((constructor));
static void msvc_cs_ctor(void) { InitializeCriticalSection(&g_cs); }

void _Init_thread_header(volatile int *guard)
{
    EnterCriticalSection(&g_cs);
    if (*guard > 0) {
        *epoch_slot() = g_epoch;
        LeaveCriticalSection(&g_cs);
        return;
    }
    *guard = -1; /* current thread becomes initializer, lock held until footer */
}

void _Init_thread_footer(volatile int *guard)
{
    g_epoch += 1;
    *epoch_slot() = g_epoch;
    *guard = (int)g_epoch;
    LeaveCriticalSection(&g_cs);
}

/* ============ operator new/delete impls (aliased in msvc_shim.S) ============ */

void *msvc_new_nothrow_impl(size_t n)
{
    return malloc(n ? n : 1);
}

void *msvc_new_plain_impl(size_t n)
{
    void *p = malloc(n ? n : 1);
    if (!p)
        abort();
    return p;
}

void msvc_delete_impl(void *p)
{
    free(p);
}

/* ============ /guard:cf dispatch (thunk in msvc_shim.S) ============ */

extern void msvc_guard_dispatch_thunk(void);
void *__guard_dispatch_icall_fptr = (void *)&msvc_guard_dispatch_thunk;
