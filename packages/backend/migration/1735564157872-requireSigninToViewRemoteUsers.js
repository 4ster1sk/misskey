/*
 * SPDX-FileCopyrightText: 4sterisk
 * SPDX-License-Identifier: AGPL-3.0-only
 */
export class RequireSigninToViewRemoteUsers1735564157872 {
    name = 'RequireSigninToViewRemoteUsers1735564157872'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "requireSigninToViewRemoteUsers" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "requireSigninToViewRemoteUsers"`);
    }
}
