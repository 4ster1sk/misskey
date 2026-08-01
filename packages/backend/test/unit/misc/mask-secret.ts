/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { maskMetaSecrets, maskSecretValue } from '@/misc/mask-secret.js';
import { META_SECRET_FIELDS } from '@/misc/meta-secret-fields.js';

describe('misc:maskSecretValue', () => {
	test('returns null for null', () => {
		expect(maskSecretValue(null)).toBeNull();
	});

	test('returns empty string for empty string', () => {
		expect(maskSecretValue('')).toBe('');
	});

	test('masks all characters when value length is less than or equal to visible length', () => {
		expect(maskSecretValue('abc')).toBe('***');
		expect(maskSecretValue('abcd')).toBe('****');
	});

	test('leaves the first N characters visible when value length is greater than visible length', () => {
		expect(maskSecretValue('abcde')).toBe('abcd*');
		expect(maskSecretValue('abcdefghij')).toBe('abcd******');
	});

	test('respects custom visible length', () => {
		expect(maskSecretValue('abcdef', 2)).toBe('ab****');
		expect(maskSecretValue('ab', 2)).toBe('**');
	});
});

describe('misc:maskMetaSecrets', () => {
	test('returns non-object values as-is', () => {
		expect(maskMetaSecrets(null)).toBeNull();
		expect(maskMetaSecrets('string')).toBe('string');
		expect(maskMetaSecrets(123)).toBe(123);
	});

	test('masks secret meta fields', () => {
		const meta = {
			hcaptchaSecretKey: 'very-long-secret-key',
			turnstileSecretKey: 'short',
			smtpPass: null,
			swPrivateKey: undefined,
		};
		const masked = maskMetaSecrets(meta) as typeof meta;
		expect(masked.hcaptchaSecretKey).toBe('very' + '*'.repeat(16));
		expect(masked.turnstileSecretKey).toBe('*****');
		expect(masked.smtpPass).toBeNull();
		expect(masked.swPrivateKey).toBeUndefined();
	});

	test('does not modify non-secret fields', () => {
		const meta = {
			name: 'instance name',
			enableHcaptcha: true,
			hcaptchaSiteKey: 'public-site-key',
		};
		const masked = maskMetaSecrets(meta) as typeof meta;
		expect(masked.name).toBe('instance name');
		expect(masked.enableHcaptcha).toBe(true);
		expect(masked.hcaptchaSiteKey).toBe('public-site-key');
	});

	test('covers all defined secret fields', () => {
		const meta: Record<string, string | null> = {};
		for (const key of META_SECRET_FIELDS) {
			meta[key] = 'secret-value';
		}
		const masked = maskMetaSecrets(meta) as Record<string, string>;
		for (const key of META_SECRET_FIELDS) {
			expect(masked[key]).toBe('secr' + '*'.repeat(9));
		}
	});
});
