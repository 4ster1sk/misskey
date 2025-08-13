/*
 * SPDX-FileCopyrightText: 4sterisk
 * SPDX-License-Identifier: AGPL-3.0-only
 */
export class RemoveMissmatchUriHosts1755092692220 {
    name = 'RemoveMissmatchUriHosts1755092692220'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "mismatchUriHosts"`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "mismatchUriHosts" character varying(1024) array NOT NULL DEFAULT '{}'`);
    }

}
