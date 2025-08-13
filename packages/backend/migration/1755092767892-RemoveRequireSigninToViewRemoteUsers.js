/*
 * SPDX-FileCopyrightText: 4sterisk
 * SPDX-License-Identifier: AGPL-3.0-only
 */
export class RemoveRequireSigninToViewRemoteUsers1755092767892 {
    name = 'RemoveRequireSigninToViewRemoteUsers1755092767892'

		async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "requireSigninToViewRemoteUsers"`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "requireSigninToViewRemoteUsers" boolean NOT NULL DEFAULT false`);
    }
}
