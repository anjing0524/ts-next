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
  get_cursor_style(x: number, y: number): string;
  handle_mouse_leave(): void;
  handle_wheel(delta: number, x: number, y: number): void;
  handle_mouse_down(x: number, y: number): boolean;
  handle_mouse_up(x: number, y: number): boolean;
  handle_mouse_drag(x: number, y: number): void;
  set_render_mode(mode: string): void;
  handle_canvas_resize(width: number, height: number): void;
  update_config(js_config: any): void;
  get_config(): any;
  get_theme(): any;
}
/**
 * WASM性能监控器
 *
 * 提供实时的性能监控功能，与前端PerformancePanel组件集成
 * 通过JS接口提供FPS、内存使用、渲染时间等指标
 */
export class PerformanceMonitor {
  free(): void;
  /**
   * 创建新的性能监控器
   */
  constructor();
  /**
   * 开始渲染性能测量
   */
  start_render_measurement(): void;
  /**
   * 结束渲染性能测量
   */
  end_render_measurement(): void;
  /**
   * 初始化性能监控器（从KlineProcess迁移）
   * 重新初始化监控器状态
   */
  init_monitor(): void;
  /**
   * 获取性能统计信息（从KlineProcess迁移）
   * 返回JSON格式的性能指标
   */
  get_performance_stats(): string;
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
  readonly klineprocess_handle_mouse_leave: (a: number) => void;
  readonly klineprocess_handle_wheel: (a: number, b: number, c: number, d: number) => void;
  readonly klineprocess_handle_mouse_down: (a: number, b: number, c: number) => number;
  readonly klineprocess_handle_mouse_up: (a: number, b: number, c: number) => number;
  readonly klineprocess_handle_mouse_drag: (a: number, b: number, c: number) => void;
  readonly klineprocess_set_render_mode: (a: number, b: number, c: number) => [number, number];
  readonly klineprocess_handle_canvas_resize: (a: number, b: number, c: number) => void;
  readonly klineprocess_update_config: (a: number, b: any) => [number, number];
  readonly klineprocess_get_config: (a: number) => [number, number, number];
  readonly klineprocess_get_theme: (a: number) => [number, number, number];
  readonly __wbg_performancemonitor_free: (a: number, b: number) => void;
  readonly performancemonitor_new: () => number;
  readonly performancemonitor_start_render_measurement: (a: number) => void;
  readonly performancemonitor_end_render_measurement: (a: number) => void;
  readonly performancemonitor_init_monitor: (a: number) => void;
  readonly performancemonitor_get_performance_stats: (a: number) => [number, number, number, number];
  readonly start: () => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_4: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
