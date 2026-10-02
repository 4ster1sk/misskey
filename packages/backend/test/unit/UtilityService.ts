/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, expect, test } from 'vitest';
import { UtilityService } from '@/core/UtilityService.js';
import type { Config } from '@/config.js';
import type { MiMeta, SoftwareSuspension } from '@/models/Meta.js';

function createService(deliverSuspendedSoftware: SoftwareSuspension[], receiveSuspendedSoftware: SoftwareSuspension[] = []): UtilityService {
	return new UtilityService({} as Config, { deliverSuspendedSoftware, receiveSuspendedSoftware } as MiMeta);
}

describe('UtilityService', () => {
	describe('isDeliverSuspendedSoftware', () => {
		test.each<{ version: string | null; range: string; expected: boolean }>([
			{ version: null, range: '*', expected: true },
			{ version: null, range: '>= 1.0.0', expected: false },
			{ version: 'unknown', range: '*', expected: true },
			{ version: 'unknown', range: '>= 0.0.0', expected: false },
			{ version: '', range: '*', expected: true },
			{ version: null, range: '', expected: true },
			{ version: 'unknown', range: '', expected: true },
			{ version: '3.30', range: '', expected: true },
			{ version: '3.30', range: '  ', expected: true },
			{ version: '3.30', range: ' * ', expected: true },
			{ version: '3.30.0', range: '*', expected: true },
			{ version: '3.30', range: '*', expected: true },
			{ version: '3.30', range: '>= 2.0.0', expected: true },
			{ version: '3.30', range: '< 2.0.0', expected: false },
			{ version: 'v1', range: '*', expected: true },
			{ version: 'v1', range: '>= 1.0.0', expected: true },
			{ version: 'v1.0.0', range: '*', expected: true },
			{ version: 'v1.0.0', range: '>= 1.0.0', expected: true },
			{ version: '1.0.0.0', range: '*', expected: true },
			{ version: '1.0.0.0', range: '>= 1.0.0', expected: true },
			{ version: '2026.9.1', range: '*', expected: true },
			{ version: '2026.9.1', range: '>= 2026.9.0', expected: true },
			{ version: '2026.9.1', range: '< 2026.9.0', expected: false },
			{ version: '2026.9.1-alpha.0', range: '>= 2026.9.1-0', expected: true },
			{ version: '2026.9.1-alpha.0', range: '>= 2026.9.1', expected: false },
		])('バージョン $version を範囲 $range で判定すると停止対象かどうかが $expected になる', ({ version, range, expected }) => {
			const service = createService([{ software: 'suspended-software', versionRange: range }]);
			const result = service.isDeliverSuspendedSoftware({ softwareName: 'suspended-software', softwareVersion: version });
			expect(result != null).toBe(expected);
		});

		test('ソフトウェア名が異なる場合は停止対象にならない', () => {
			const service = createService([{ software: 'suspended-software', versionRange: '*' }]);
			const result = service.isDeliverSuspendedSoftware({ softwareName: 'misskey', softwareVersion: '2026.9.0' });
			expect(result).toBeUndefined();
		});

		test('ソフトウェア名が null の場合は停止対象にならない', () => {
			const service = createService([{ software: 'suspended-software', versionRange: '*' }]);
			const result = service.isDeliverSuspendedSoftware({ softwareName: null, softwareVersion: '3.30' });
			expect(result).toBeUndefined();
		});

		test('設定が複数ある場合は一致した設定を返す', () => {
			const matched: SoftwareSuspension = { software: 'suspended-software', versionRange: '>= 2.0.0' };
			const service = createService([
				{ software: 'other-software', versionRange: '*' },
				{ software: 'suspended-software', versionRange: '< 2.0.0' },
				matched,
			]);
			const result = service.isDeliverSuspendedSoftware({ softwareName: 'suspended-software', softwareVersion: '3.30' });
			expect(result).toBe(matched);
		});
	});

	describe('isReceiveSuspendedSoftware', () => {
		test('受信停止の設定で判定される', () => {
			const service = createService([], [{ software: 'suspended-software', versionRange: '' }]);
			const result = service.isReceiveSuspendedSoftware({ softwareName: 'suspended-software', softwareVersion: '3.30' });
			expect(result).toEqual({ software: 'suspended-software', versionRange: '' });
		});

		test('配信停止の設定は受信停止の判定に影響しない', () => {
			const service = createService([{ software: 'suspended-software', versionRange: '*' }], []);
			const result = service.isReceiveSuspendedSoftware({ softwareName: 'suspended-software', softwareVersion: '3.30' });
			expect(result).toBeUndefined();
		});

		test('受信停止の設定は配信停止の判定に影響しない', () => {
			const service = createService([], [{ software: 'suspended-software', versionRange: '*' }]);
			const result = service.isDeliverSuspendedSoftware({ softwareName: 'suspended-software', softwareVersion: '3.30' });
			expect(result).toBeUndefined();
		});
	});
});
