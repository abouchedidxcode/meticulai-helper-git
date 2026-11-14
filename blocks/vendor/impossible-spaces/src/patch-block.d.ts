declare module 'patch-block' {
	export interface Block {
		values: Record<string, number | boolean | string>;
		ready(): void;
		progress(share: number, words?: string): void;
		state(values: Record<string, number | boolean | string>): void;
	}
	export function patchBlock(options: Record<string, unknown>): Block;
}
