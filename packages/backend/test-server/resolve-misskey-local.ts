/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * misskey.local を 127.0.0.1 に解決するためのDNSフック。
 *
 * e2eテスト中、設定ファイル(.config/test.yml)で misskey.local を
 * ホスト名として使用しているため、本来であれば /etc/hosts などに
 * "127.0.0.1 misskey.local" を追記する必要がある。
 * しかし開発者全員にOS毎の対応(特にWindowsの管理者権限要求)を求めるのは
 * 現実的でないため、Node.jsレベルで名前解決をフックして対応する。
 *
 * Misskey本体(HttpRequestService)が利用するgotは内部で cacheable-lookup を
 * 使用しており、これは new dns.promises.Resolver() のインスタンスメソッド
 * resolve4/resolve6 を直接利用する。そのため、dns.resolve4 を差し替える
 * だけでは効果がなく、Resolverのprototypeメソッドも差し替える必要がある。
 */

import dns from 'node:dns';

const isLocal = (hostname: string): boolean =>
	hostname === 'misskey.local' || hostname.endsWith('.misskey.local');

// --- dns.lookup ---
const originalLookup = dns.lookup;
// @ts-expect-error -- dns.lookupはオーバーロード型が複雑なため動的な上書きには型エラーが発生する
dns.lookup = (hostname: string, options: any, callback: any) => {
	if (isLocal(hostname)) {
		const cb = typeof options === 'function' ? options : callback;
		return cb(null, '127.0.0.1', 4);
	}
	return originalLookup(hostname, options, callback);
};

// --- dns.promises.lookup ---
const originalLookupPromise = dns.promises.lookup;
// @ts-expect-error -- dns.promises.lookupもオーバーロード型が複雑なため
dns.promises.lookup = async (hostname: string, options: any) => {
	if (isLocal(hostname)) {
		return { address: '127.0.0.1', family: 4 };
	}
	return originalLookupPromise(hostname, options);
};

// --- dns.resolve4 ---
const originalResolve4 = dns.resolve4;
// @ts-expect-error -- dns.resolve4のオーバーロード型と動的な上書きが整合しないため
dns.resolve4 = (hostname: string, options: any, callback: any) => {
	if (isLocal(hostname)) {
		const cb = typeof options === 'function' ? options : callback;
		const wantTtl = typeof options === 'object' && options?.ttl;
		return cb(null, wantTtl ? [{ address: '127.0.0.1', ttl: 60 }] : ['127.0.0.1']);
	}
	return originalResolve4(hostname, options, callback);
};

// --- dns.resolve6 ---
const originalResolve6 = dns.resolve6;
// @ts-expect-error -- dns.resolve6のオーバーロード型と動的な上書きが整合しないため
dns.resolve6 = (hostname: string, options: any, callback: any) => {
	if (isLocal(hostname)) {
		const cb = typeof options === 'function' ? options : callback;
		return cb(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));
	}
	return originalResolve6(hostname, options, callback);
};

// --- dns.promises.resolve4 ---
const originalResolve4Promise = dns.promises.resolve4;
// @ts-expect-error -- dns.promises.resolve4のオーバーロード型のため
dns.promises.resolve4 = async (hostname: string, options: any) => {
	if (isLocal(hostname)) {
		return options?.ttl ? [{ address: '127.0.0.1', ttl: 60 }] : ['127.0.0.1'];
	}
	return originalResolve4Promise(hostname, options);
};

// --- dns.promises.resolve6 ---
const originalResolve6Promise = dns.promises.resolve6;
// @ts-expect-error -- dns.promises.resolve6のオーバーロード型のため
dns.promises.resolve6 = async (hostname: string, options: any) => {
	if (isLocal(hostname)) {
		throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
	}
	return originalResolve6Promise(hostname, options);
};

// --- dns.Resolver.prototype.resolve4/6 (cacheable-lookup対策) ---
// cacheable-lookupは new dns.promises.Resolver() のインスタンスメソッドを
// .bind() して保持するため、prototypeを差し替える必要がある
const originalResolverResolve4 = dns.Resolver.prototype.resolve4;
// @ts-expect-error -- Resolverプロトタイプメソッドの型が複雑なため
dns.Resolver.prototype.resolve4 = function (hostname: string, options: any, callback: any) {
	if (isLocal(hostname)) {
		const cb = typeof options === 'function' ? options : callback;
		const wantTtl = typeof options === 'object' && options?.ttl;
		return cb(null, wantTtl ? [{ address: '127.0.0.1', ttl: 60 }] : ['127.0.0.1']);
	}
	return originalResolverResolve4.call(this, hostname, options, callback);
};

const originalResolverResolve6 = dns.Resolver.prototype.resolve6;
// @ts-expect-error -- Resolverプロトタイプメソッドの型が複雑なため
dns.Resolver.prototype.resolve6 = function (hostname: string, options: any, callback: any) {
	if (isLocal(hostname)) {
		const cb = typeof options === 'function' ? options : callback;
		return cb(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));
	}
	return originalResolverResolve6.call(this, hostname, options, callback);
};

// --- dns.promises.Resolver.prototype.resolve4/6 (これが本命) ---
const originalPromiseResolverResolve4 = dns.promises.Resolver.prototype.resolve4;
// @ts-expect-error -- Resolverプロトタイプメソッドの型が複雑なため
dns.promises.Resolver.prototype.resolve4 = async function (hostname: string, options?: any) {
	if (isLocal(hostname)) {
		return options?.ttl ? [{ address: '127.0.0.1', ttl: 60 }] : ['127.0.0.1'];
	}
	return originalPromiseResolverResolve4.call(this, hostname, options);
};

const originalPromiseResolverResolve6 = dns.promises.Resolver.prototype.resolve6;
// @ts-expect-error -- Resolverプロトタイプメソッドの型が複雑なため
dns.promises.Resolver.prototype.resolve6 = async function (hostname: string, options?: any) {
	if (isLocal(hostname)) {
		throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
	}
	return originalPromiseResolverResolve6.call(this, hostname, options);
};
