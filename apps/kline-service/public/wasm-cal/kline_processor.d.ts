/* tslint:disable */
/* eslint-disable */
export function start(): void;
/**
 * KlineProcess - 持有K线数据和渲染器，提供统一的绘制函数
 */
export class KlineProcess {
  free(): void;
  /**
   * 创建新的KlineProcess实例
   */
  constructor(memory_val: any, ptr_offset: number, data_length: number);
  /**
   * 设置三层Canvas
   */
  set_canvases(base_canvas: OffscreenCanvas, main_canvas: OffscreenCanvas, overlay_canvas: OffscreenCanvas): void;
  /**
   * 绘制所有图表
   */
  draw_all(): void;
  handle_mouse_move(x: number, y: number): void;
  /**
   * 获取当前鼠标位置的光标样式
   */
  get_cursor_style(x: number, y: number): string;
  handle_mouse_leave(): boolean;
  handle_wheel(delta: number, x: number, y: number): void;
  /**
   * 处理鼠标按下事件
   */
  handle_mouse_down(x: number, y: number): boolean;
  /**
   * 处理鼠标释放事件
   */
  handle_mouse_up(x: number, y: number): boolean;
  /**
   * 处理鼠标拖动事件
   */
  handle_mouse_drag(x: number, y: number): void;
  /**
   * 设置渲染模式（由React层调用）
   */
  set_render_mode(mode: string): void;
  /**
   * 处理鼠标点击事件（已废弃，模式切换由React层管理）
   */
  handle_click(_x: number, _y: number): boolean;
  /**
   * 设置配置JSON（动态切换主题/配色等）
   */
  set_config_json(json: string): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_klineprocess_free: (a: number, b: number) => void;
  readonly klineprocess_new: (a: any, b: number, c: number) => [number, number, number];
  readonly klineprocess_set_canvases: (a: number, b: any, c: any, d: any) => [number, number];
  readonly klineprocess_draw_all: (a: number) => [number, number];
  readonly klineprocess_handle_mouse_move: (a: number, b: number, c: number) => void;
  readonly klineprocess_get_cursor_style: (a: number, b: number, c: number) => [number, number];
  readonly klineprocess_handle_mouse_leave: (a: number) => number;
  readonly klineprocess_handle_wheel: (a: number, b: number, c: number, d: number) => void;
  readonly klineprocess_handle_mouse_down: (a: number, b: number, c: number) => number;
  readonly klineprocess_handle_mouse_up: (a: number, b: number, c: number) => number;
  readonly klineprocess_handle_mouse_drag: (a: number, b: number, c: number) => void;
  readonly klineprocess_set_render_mode: (a: number, b: number, c: number) => [number, number];
  readonly klineprocess_handle_click: (a: number, b: number, c: number) => number;
  readonly klineprocess_set_config_json: (a: number, b: number, c: number) => [number, number];
  readonly start: () => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_3: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
