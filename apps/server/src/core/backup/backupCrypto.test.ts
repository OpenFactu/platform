import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { isBackupFileName, isEncryptedBackup, openBackup, sealBackup } from './backupCrypto';

const key = crypto.randomBytes(32);
const zip = Buffer.from('PK\u0003\u0004 contenido de la copia');

test('ida y vuelta', () => {
  const sealed = sealBackup(zip, key);
  assert.ok(isEncryptedBackup(sealed));
  assert.ok(!sealed.includes('contenido'));
  assert.deepEqual(openBackup(sealed, key), zip);
});

test('un zip sin cifrar se lee tal cual, aunque no haya clave', () => {
  assert.deepEqual(openBackup(zip, null), zip);
});

test('cifrada y sin clave: lo dice', () => {
  assert.throws(() => openBackup(sealBackup(zip, key), null), /falta BACKUP_ENC_KEY/);
});

test('con otra clave: lo dice', () => {
  const other = crypto.randomBytes(32);
  assert.throws(() => openBackup(sealBackup(zip, key), other), /no es la clave/);
});

test('alterada: no se abre', () => {
  const sealed = sealBackup(zip, key);
  sealed[sealed.length - 1] ^= 1;
  assert.throws(() => openBackup(sealed, key));
});

test('los dos nombres de fichero cuentan como copia', () => {
  assert.ok(isBackupFileName('keirost_x_1.zip'));
  assert.ok(isBackupFileName('keirost_x_1.zip.enc'));
  assert.ok(!isBackupFileName('otra.pdf'));
});
