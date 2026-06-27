// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
#![cfg(windows)]
//! Behavioral proof for the Job Object orphan-guard.
//!
//! This exercises the exact OS path a parent crash triggers: a job with
//! KILL_ON_JOB_CLOSE, a member process, then the last job handle closing → the
//! OS kills the member. It uses an INDEPENDENT job and a throwaway child (never
//! the self-assign path, which would kill the test runner).

use std::os::windows::io::AsRawHandle;
use std::process::Command;
use std::time::{Duration, Instant};

use windows::core::PCWSTR;
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject,
    JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

#[test]
fn closing_job_handle_kills_member_process() {
    unsafe {
        // Independent kill-on-close job (NOT the current process's job).
        let job = CreateJobObjectW(None, PCWSTR::null()).expect("CreateJobObjectW");
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = core::mem::zeroed();
        info.BasicLimitInformation.LimitFlags |= JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const core::ffi::c_void,
            core::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
        .expect("SetInformationJobObject");

        // Long-lived throwaway child (~60s): ping loopback 61 times.
        let mut child = Command::new("cmd")
            .args(["/c", "ping -n 61 127.0.0.1 >nul"])
            .spawn()
            .expect("spawn throwaway child");

        let child_handle = HANDLE(child.as_raw_handle());
        AssignProcessToJobObject(job, child_handle).expect("AssignProcessToJobObject");

        // The child must be alive right after assignment.
        assert!(
            matches!(child.try_wait(), Ok(None)),
            "child should still be running before the job handle is closed"
        );

        // Close the last handle to the job → the OS kills every job member.
        CloseHandle(job).expect("CloseHandle(job)");

        // Within ~5s the child must be dead — the guarantee a parent crash relies on.
        let deadline = Instant::now() + Duration::from_secs(5);
        let mut exited = false;
        while Instant::now() < deadline {
            match child.try_wait() {
                Ok(Some(_status)) => {
                    exited = true;
                    break;
                }
                _ => std::thread::sleep(Duration::from_millis(100)),
            }
        }

        if !exited {
            let _ = child.kill(); // best-effort cleanup if the guarantee failed
            panic!("child was NOT killed within 5s after closing the job handle");
        }
    }
}
