//! 布局引擎模块 - 负责将声明式布局定义计算为具体的矩形区域

use super::definition::{Constraint, LayoutNode, PaneId, Rect};
use std::collections::HashMap;

pub type ComputedLayout = HashMap<PaneId, Rect>;

pub struct LayoutEngine;

impl LayoutEngine {
    /// 计算布局
    pub fn calculate(definition: &LayoutNode, canvas_bounds: Rect) -> ComputedLayout {
        let mut computed = ComputedLayout::new();
        Self::compute_node(definition, canvas_bounds, &mut computed);
        computed
    }

    /// 递归计算节点
    fn compute_node(node: &LayoutNode, bounds: Rect, computed: &mut ComputedLayout) {
        match node {
            LayoutNode::Pane { id, .. } => {
                computed.insert(id.clone(), bounds);
            }
            LayoutNode::VBox { id, children, .. } => {
                computed.insert(id.clone(), bounds);
                Self::compute_children(children, bounds, true, computed);
            }
            LayoutNode::HBox { id, children, .. } => {
                computed.insert(id.clone(), bounds);
                Self::compute_children(children, bounds, false, computed);
            }
        }
    }

    /// 计算子节点的布局 (通用版本)
    fn compute_children(
        children: &[LayoutNode],
        bounds: Rect,
        is_vertical: bool,
        computed: &mut ComputedLayout,
    ) {
        let total_size = if is_vertical {
            bounds.height
        } else {
            bounds.width
        };
        let mut remaining_size = total_size;
        let mut fill_count = 0;

        // Pass 1: Calculate fixed and percent sizes
        for child in children {
            let constraint = match child {
                LayoutNode::Pane { constraint, .. } => constraint,
                LayoutNode::VBox { constraint, .. } => constraint,
                LayoutNode::HBox { constraint, .. } => constraint,
            };

            match constraint {
                Constraint::Fixed(val) => remaining_size -= val,
                Constraint::Percent(p) => remaining_size -= total_size * p / 100.0,
                Constraint::Fill => fill_count += 1,
            }
        }

        let fill_size = if fill_count > 0 {
            remaining_size.max(0.0) / fill_count as f64
        } else {
            0.0
        };
        let mut current_offset = if is_vertical { bounds.y } else { bounds.x };

        // Pass 2: Assign rects and recurse
        for child in children {
            let constraint = match child {
                LayoutNode::Pane { constraint, .. } => *constraint,
                LayoutNode::VBox { constraint, .. } => *constraint,
                LayoutNode::HBox { constraint, .. } => *constraint,
            };

            let child_size = match constraint {
                Constraint::Fixed(val) => val,
                Constraint::Percent(p) => total_size * p / 100.0,
                Constraint::Fill => fill_size,
            };

            let child_bounds = if is_vertical {
                Rect {
                    x: bounds.x,
                    y: current_offset,
                    width: bounds.width,
                    height: child_size,
                }
            } else {
                Rect {
                    x: current_offset,
                    y: bounds.y,
                    width: child_size,
                    height: bounds.height,
                }
            };

            Self::compute_node(child, child_bounds, computed);
            current_offset += child_size;
        }
    }
}
