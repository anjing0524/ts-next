use crate::canvas::CanvasManager;
use crate::data::DataManager;
use crate::layout::ChartLayout;
use crate::render::chart_renderer::RenderMode;
use std::cell::RefCell;
use std::rc::Rc;
// OffscreenCanvasRenderingContext2d is no longer needed here directly
// as ComprehensiveRenderer gets it from CanvasManager.

// pub trait LayerRenderer {
//     fn draw_on_layer(
//         &self,
//         ctx: &OffscreenCanvasRenderingContext2d,
//         layout: &ChartLayout,
//         data_manager: &Rc<RefCell<DataManager>>,
//         mode: RenderMode,
//     );
// }

pub trait ComprehensiveRenderer {
    fn render_component(
        &self,
        canvas_manager: &CanvasManager,
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
        mode: RenderMode,
    );
}
