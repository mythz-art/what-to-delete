/* msvc_shim.S — MSVC-mangled symbol aliases + native TLS epoch variable.
 * GAS needs double-quoted names for MSVC mangles. */

    .text

/* void* operator new(unsigned __int64, std::nothrow_t const&) */
    .globl "??2@YAPEAX_KAEBUnothrow_t@std@@@Z"
"??2@YAPEAX_KAEBUnothrow_t@std@@@Z":
    jmp msvc_new_nothrow_impl

/* void* operator new(unsigned __int64) */
    .globl "??2@YAPEAX_K@Z"
"??2@YAPEAX_K@Z":
    jmp msvc_new_plain_impl

/* void operator delete(void*, unsigned __int64) */
    .globl "??3@YAXPEAX_K@Z"
"??3@YAXPEAX_K@Z":
    jmp msvc_delete_impl

/* void operator delete(void*) */
    .globl "??3@YAXPEAX@Z"
"??3@YAXPEAX@Z":
    jmp msvc_delete_impl

/* /guard:cf dispatch thunk: tail-jump to target in %rax (no stack changes) */
    .globl msvc_guard_dispatch_thunk
msvc_guard_dispatch_thunk:
    jmp *%rax

    .data

/* std::nothrow const object — only its address is taken */
    .globl "?nothrow@std@@3Unothrow_t@1@B"
"?nothrow@std@@3Unothrow_t@1@B":
    .zero 8

    .section .tls$wtd,"w"

/* MSVC `unsigned long` per-thread epoch watermark (native COFF TLS).
 * The WebView2Loader code accesses it as: TEB.TLSarray[_tls_index] + SECREL32(this symbol). */
    .globl _Init_thread_epoch
    .align 4
_Init_thread_epoch:
    .long 0
