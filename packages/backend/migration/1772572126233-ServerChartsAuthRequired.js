/*
 * SPDX-FileCopyrightText: 4sterisk
 * SPDX-License-Identifier: AGPL-3.0-only
 */
export class serverChartsAuthRequired1772572126233 {
    name = 'serverChartsAuthRequired1772572126233'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "serverChartsAuthRequired" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "serverChartsAuthRequired"`);
    }
}
