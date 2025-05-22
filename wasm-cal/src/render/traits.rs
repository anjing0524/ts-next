use crate::canvas::CanvasManager;
use crate::data::DataManager;
use crate::layout::ChartLayout;
use web_sys::OffscreenCanvasRenderingContext2d;
use crate::render::chart_renderer::RenderMode;
use std::cell::RefCell;
use std::rc::Rc;
// OffscreenCanvasRenderingContext2d is no longer needed here directly
// as ComprehensiveRenderer gets it from CanvasManager.

pub trait ComprehensiveRenderer {
    fn render_component(
        &self,
        canvas_manager: &CanvasManager,
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
        mode: RenderMode,
    );
}
