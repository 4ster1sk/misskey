/*
 * SPDX-FileCopyrightText: 4sterisk
 * SPDX-License-Identifier: AGPL-3.0-only
 */
export class MismatchUriHosts1735399216893 {
    name = 'MismatchUriHosts1735399216893'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "mismatchUriHosts" character varying(1024) array NOT NULL DEFAULT '{}'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "mismatchUriHosts"`);
    }
}
