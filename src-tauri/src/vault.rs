use std::fs;
use std::io::Write;
use std::path::PathBuf;

use aes_gcm::aead::{Aead, Payload};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use rand::RngCore;
use serde::{Deserialize, Serialize};

use crate::state::{now_ms, vault_dir, vault_index_path, AppState};
use crate::types::VaultItem;

const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const PBKDF2_ITERS: u32 = 120_000;
const MAGIC: &[u8; 5] = b"WTDV2";

/// Vault secret, XOR-obfuscated so the plaintext never appears in the binary.
/// Recovers to the same code as the v1.1.0 feedback easter egg.
const OBF_CODE: [u8; 4] = [0x68, 0x6B, 0x6A, 0x6D];
const OBF_KEY: u8 = 0x59;

pub fn secret_matches(input: &str) -> bool {
    let b = input.trim().as_bytes();
    if b.len() != OBF_CODE.len() {
        return false;
    }
    b.iter()
        .zip(OBF_CODE.iter())
        .all(|(a, o)| a ^ o == OBF_KEY)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultRecord {
    id: String,
    name: String,
    orig_path: String,
    bytes: u64,
    added_at: u64,
}

fn derive_key(pass: &str, salt: &[u8]) -> [u8; 32] {
    let mut key = [0u8; 32];
    pbkdf2::pbkdf2_hmac::<sha2::Sha256>(pass.as_bytes(), salt, PBKDF2_ITERS, &mut key);
    key
}

fn encrypt(key: &[u8; 32], nonce: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(key.into());
    let n = Nonce::from_slice(nonce);
    cipher
        .encrypt(n, Payload { msg: plaintext, aad: &[] })
        .map_err(|_| "encrypt failed".to_string())
}

fn decrypt(key: &[u8; 32], nonce: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(key.into());
    let n = Nonce::from_slice(nonce);
    cipher
        .decrypt(n, Payload { msg: ciphertext, aad: &[] })
        .map_err(|_| "wrong passphrase".to_string())
}

fn write_index(key: &[u8; 32], records: &[VaultRecord]) -> Result<(), String> {
    let pt = serde_json::to_vec(records).map_err(|e| e.to_string())?;
    let mut salt = [0u8; SALT_LEN];
    let mut nonce = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    rand::thread_rng().fill_bytes(&mut nonce);
    let ct = encrypt(key, &nonce, &pt)?;

    let mut out = Vec::with_capacity(5 + SALT_LEN + NONCE_LEN + ct.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ct);
    let mut f = fs::File::create(vault_index_path()).map_err(|e| e.to_string())?;
    f.write_all(&out).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn vault_unlock(state: &AppState, passphrase: &str) -> Result<bool, String> {
    let raw = match fs::read(vault_index_path()) {
        Ok(r) => r,
        Err(_) => {
            // no vault yet: the secret creates a fresh one
            if !secret_matches(passphrase) {
                return Ok(false);
            }
            let mut salt = [0u8; SALT_LEN];
            rand::thread_rng().fill_bytes(&mut salt);
            let key = derive_key(passphrase, &salt);
            write_index(&key, &[])?;
            *state.vault_key.lock().unwrap() = Some(key);
            *state.vault_items.lock().unwrap() = Vec::new();
            return Ok(true);
        }
    };

    if raw.len() < MAGIC.len() + SALT_LEN + NONCE_LEN || &raw[0..5] != MAGIC {
        return Ok(false);
    }
    let salt = &raw[5..5 + SALT_LEN];
    let nonce = &raw[5 + SALT_LEN..5 + SALT_LEN + NONCE_LEN];
    let ct = &raw[5 + SALT_LEN + NONCE_LEN..];
    let key = derive_key(passphrase, salt);
    let pt = decrypt(&key, nonce, ct)?;
    let records: Vec<VaultRecord> = serde_json::from_slice(&pt).map_err(|e| e.to_string())?;
    let items: Vec<VaultItem> = records
        .iter()
        .map(|r| VaultItem {
            id: r.id.clone(),
            name: r.name.clone(),
            bytes: r.bytes,
            added_at: r.added_at,
        })
        .collect();
    *state.vault_items.lock().unwrap() = items;
    *state.vault_key.lock().unwrap() = Some(key);
    Ok(true)
}

pub fn vault_lock(state: &AppState) {
    *state.vault_key.lock().unwrap() = None;
    *state.vault_items.lock().unwrap() = Vec::new();
}

pub fn vault_list(state: &AppState) -> Vec<VaultItem> {
    state.vault_items.lock().unwrap().clone()
}

pub fn vault_add(state: &AppState, paths: &[String]) -> Result<Vec<VaultItem>, String> {
    let key = {
        let k = state.vault_key.lock().unwrap();
        let Some(k) = k.as_ref() else {
            return Err("vault locked".into());
        };
        *k
    };

    let mut added = Vec::new();
    for p in paths {
        let path = PathBuf::from(p);
        let Ok(meta) = fs::metadata(&path) else {
            continue;
        };
        if !meta.is_file() {
            continue;
        }
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        let id = format!("{}-{:x}", now_ms(), crate::junk::fnv1a(p));
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "sealed.bin".into());

        // encrypt content: nonce || ciphertext
        let mut nonce = [0u8; NONCE_LEN];
        rand::thread_rng().fill_bytes(&mut nonce);
        let ct = encrypt(&key, &nonce, &bytes)?;
        let mut blob = Vec::with_capacity(NONCE_LEN + ct.len());
        blob.extend_from_slice(&nonce);
        blob.extend_from_slice(&ct);
        fs::write(vault_dir().join(format!("{id}.bin")), &blob).map_err(|e| e.to_string())?;

        added.push(VaultItem {
            id: id.clone(),
            name,
            bytes: bytes.len() as u64,
            added_at: now_ms(),
        });
    }

    state.vault_items.lock().unwrap().extend(added.iter().cloned());
    save_index(&key, state)?;
    Ok(added)
}

fn save_index(key: &[u8; 32], state: &AppState) -> Result<(), String> {
    let items = state.vault_items.lock().unwrap();
    let records: Vec<VaultRecord> = items
        .iter()
        .map(|i| VaultRecord {
            id: i.id.clone(),
            name: i.name.clone(),
            orig_path: format!("restored\\{}", i.name),
            bytes: i.bytes,
            added_at: i.added_at,
        })
        .collect();
    drop(items);
    write_index(key, &records)
}

pub fn vault_remove(state: &AppState, id: &str) -> Result<(), String> {
    let key = {
        let k = state.vault_key.lock().unwrap();
        let Some(k) = k.as_ref() else {
            return Err("vault locked".into());
        };
        *k
    };

    let name = {
        let items = state.vault_items.lock().unwrap();
        items
            .iter()
            .find(|i| i.id == id)
            .map(|i| i.name.clone())
            .unwrap_or_default()
    };

    // decrypt the file back to the restored folder, then forget it
    let data_file = vault_dir().join(format!("{id}.bin"));
    if let Ok(blob) = fs::read(&data_file) {
        if blob.len() > NONCE_LEN {
            if let Ok(pt) = decrypt(&key, &blob[..NONCE_LEN], &blob[NONCE_LEN..]) {
                let restore_dir = crate::state::data_dir().join("restored");
                let _ = fs::create_dir_all(&restore_dir);
                let _ = fs::write(restore_dir.join(&name), &pt);
            }
        }
    }
    let _ = fs::remove_file(&data_file);

    state.vault_items.lock().unwrap().retain(|i| i.id != id);
    save_index(&key, state)
}
