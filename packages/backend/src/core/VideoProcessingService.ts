/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import FormDataNode from 'form-data';
import { fileTypeFromBuffer } from 'file-type';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { IImage } from '@/core/ImageProcessingService.js';
import { bindThis } from '@/decorators.js';
import { appendQuery, query } from '@/misc/prelude/url.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';

@Injectable()
export class VideoProcessingService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		private httpRequestService: HttpRequestService,
	) {
	}

	@bindThis
	public async generateVideoThumbnail(source: string): Promise<IImage> {
		const form = new FormDataNode();
		const stream = fs.createReadStream(source);
		form.append('file', stream, {
			filename: path.basename(source),
			knownLength: (await fs.promises.stat(source)).size,
		});

		const endpoint = `${this.config.videoThumbServer}/thumbnail`;
		const response = await this.httpRequestService.send(endpoint, {
			method: 'POST',
			headers: {
				Accept: 'image/webp, image/*',
			},
			body: form,
		});

		const data = Buffer.from(await response.arrayBuffer());
		const fileType = await fileTypeFromBuffer(data);
		if (fileType == null) {
			throw new Error('Failed to detect file type from thumbnail server response');
		}

		return {
			data,
			ext: fileType.ext,
			type: fileType.mime,
		};
	}

	@bindThis
	public getExternalVideoThumbnailUrl(url: string): string | null {
		if (this.config.videoThumbnailGenerator == null) return null;

		return appendQuery(
			`${this.config.videoThumbnailGenerator}/thumbnail.webp`,
			query({
				thumbnail: '1',
				url,
			}),
		);
	}
}

