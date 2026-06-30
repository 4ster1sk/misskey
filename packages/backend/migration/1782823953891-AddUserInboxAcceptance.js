/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddUserInboxAcceptance1782823953891 {
    name = 'AddUserInboxAcceptance1782823953891'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" ADD "inboxAcceptance" character varying(16) NOT NULL DEFAULT 'all'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "inboxAcceptance"`);
    }
}
