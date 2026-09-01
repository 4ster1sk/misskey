/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AlterInboxAcceptance1788275300132 {
	name = 'AlterInboxAcceptance1788275300132'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "inboxAcceptance" TYPE character varying(32)`);
		await queryRunner.query(`COMMENT ON COLUMN "user"."inboxAcceptance" IS 'The inbox acceptance policy for this user.'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "inboxAcceptance" TYPE character varying(16)`);
		await queryRunner.query(`COMMENT ON COLUMN "user"."inboxAcceptance" IS 'The inbox acceptance policy for this user.'`);
	}
}
