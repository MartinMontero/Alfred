// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
#![cfg(windows)]
//! Windows Job Object orphan-guard.
//!
//! Graceful shutdown hooks (the JS `beforeunload` / `onCloseRequested` in
//! `acp-client.ts`) cannot run when Alfred dies abnormally (crash, SIGKILL, Task
//! Manager). On Windows the child `goose acp` process (~236 MB) is **not** reaped
//! when its parent dies, so it would orphan.
//!
//! This binds the current process to a Job Object configured with
//! `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. Every process Alfred spawns (the goose
//! sidecar and its descendants) inherits the job. When the **last handle** to the
//! job closes — which the OS does automatically when this process dies, by any
//! means — the OS terminates every remaining member of the job. No orphans.

use std::sync::OnceLock;

use windows::core::PCWSTR;
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject,
    JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};
use windows::Win32::System::Threading::GetCurrentProcess;

/// Holds the job handle for the lifetime of the process. The handle is
/// deliberately **never closed**: the OS closing it on process death is precisely
/// the trigger that kills the job's members. A raw `HANDLE` is not `Send`/`Sync`;
/// it is created once on the main thread at startup and never dereferenced again,
/// so it is sound to share.
struct JobHandle(#[allow(dead_code)] HANDLE);
unsafe impl Send for JobHandle {}
unsafe impl Sync for JobHandle {}

static JOB: OnceLock<JobHandle> = OnceLock::new();

/// Assign the current process to a kill-on-close Job Object so the goose sidecar
/// (and any descendant) cannot orphan if Alfred exits abnormally.
///
/// Degrades gracefully: if the process is already in a job that forbids
/// re-assignment, this logs a warning and returns. The app still runs — just
/// without the guard. Never panics; never blocks startup.
pub fn assign_self_to_kill_on_close_job() {
    if JOB.get().is_some() {
        return; // idempotent
    }
    match unsafe { install_job() } {
        Ok(job) => {
            // Keep the handle alive for the whole process lifetime. If another
            // thread won the race, close ours (the OS needs only one live handle).
            if JOB.set(JobHandle(job)).is_err() {
                unsafe {
                    let _ = CloseHandle(job);
                }
            }
        }
        Err(e) => {
            log::warn!(
                "goose orphan-guard: could not bind to a kill-on-close Job Object ({e:?}); \
                 the goose sidecar may orphan if Alfred is killed abnormally"
            );
        }
    }
}

unsafe fn install_job() -> windows::core::Result<HANDLE> {
    let job = CreateJobObjectW(None, PCWSTR::null())?;

    // Set KILL_ON_JOB_CLOSE *before* assigning the process to the job.
    let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = core::mem::zeroed();
    info.BasicLimitInformation.LimitFlags |= JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    SetInformationJobObject(
        job,
        JobObjectExtendedLimitInformation,
        &info as *const _ as *const core::ffi::c_void,
        core::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
    )?;

    AssignProcessToJobObject(job, GetCurrentProcess())?;
    Ok(job)
}
