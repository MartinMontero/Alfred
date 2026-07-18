// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
#![cfg(test)]
//! F1 regression (beta.1 smoke test): first-run vault creation must validate
//! when the vault directory does not exist yet — create_folder is called with
//! path == vault on a fresh machine. The pre-fix code canonicalized the vault
//! side unconditionally and failed every fresh install (red-first record in
//! the design-ship audit note). Containment must hold under the same lenient
//! resolution rules.

use crate::validate_vault_path;
use std::path::PathBuf;

fn scratch(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("alfred-vp-{name}-{}", std::process::id()));
    std::fs::create_dir_all(&d).unwrap();
    d
}

#[test]
fn first_run_vault_creation_validates_when_vault_does_not_exist() {
    let base = scratch("firstrun");
    let vault = base.join("new-vault"); // deliberately never created
    let v = vault.to_str().unwrap();
    let r = validate_vault_path(v, v);
    assert!(r.is_ok(), "first-run create_folder(path == vault) must validate, got: {r:?}");
}

#[test]
fn nested_new_file_under_nonexistent_vault_is_inside() {
    let base = scratch("nested");
    let vault = base.join("new-vault");
    let inner = vault.join("notes").join("a.md");
    assert!(validate_vault_path(inner.to_str().unwrap(), vault.to_str().unwrap()).is_ok());
}

#[test]
fn containment_holds_for_nonexistent_vault() {
    let base = scratch("contain");
    let vault = base.join("new-vault");
    let v = vault.to_str().unwrap();
    // Parent-directory escape is rejected by component screening.
    let escape = vault.join("..").join("escape");
    assert!(validate_vault_path(escape.to_str().unwrap(), v).is_err());
    // A sibling whose name merely extends the vault's must not pass —
    // starts_with is component-wise, verified here against regression.
    let sibling = base.join("new-vault-evil");
    assert!(validate_vault_path(sibling.to_str().unwrap(), v).is_err());
}

#[test]
fn existing_vault_behavior_unchanged() {
    let base = scratch("existing");
    let vault = base.join("vault");
    std::fs::create_dir_all(vault.join("sub")).unwrap();
    let v = vault.to_str().unwrap();
    assert!(validate_vault_path(vault.join("sub").join("n.md").to_str().unwrap(), v).is_ok());
    assert!(validate_vault_path(base.join("outside.md").to_str().unwrap(), v).is_err());
}
