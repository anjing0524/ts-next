//! src/data/model.rs
//! 定义统一的数据模型，用于封装来自不同来源（FlatBuffers、自有结构）的K线数据。

use crate::kline_generated::kline::{self};

// --- Owned Structs ---

/// 持有 PriceVolume 数据的自有结构体。
#[derive(Debug, Clone, PartialEq)]
pub struct PriceVolumeOwned {
    pub price: f64,
    pub volume: f64,
}

impl<'a> From<&kline::PriceVolume<'a>> for PriceVolumeOwned {
    fn from(pv: &kline::PriceVolume<'a>) -> Self {
        Self {
            price: pv.price(),
            volume: pv.volume(),
        }
    }
}

/// 持有 KlineItem 数据的自有结构体。
/// 用于存储从SSE接收到的增量数据。
#[derive(Debug, Clone, PartialEq)]
pub struct KlineItemOwned {
    pub timestamp: i32,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub b_vol: f64,
    pub s_vol: f64,
    pub volumes: Vec<PriceVolumeOwned>,
    pub last_price: f64,
    pub bid_price: f64,
    pub ask_price: f64,
}

impl<'a> From<&kline::KlineItem<'a>> for KlineItemOwned {
    fn from(item: &kline::KlineItem<'a>) -> Self {
        let volumes = item.volumes().map_or_else(Vec::new, |v| {
            v.iter().map(|pv| PriceVolumeOwned::from(&pv)).collect()
        });

        Self {
            timestamp: item.timestamp(),
            open: item.open(),
            high: item.high(),
            low: item.low(),
            close: item.close(),
            b_vol: item.b_vol(),
            s_vol: item.s_vol(),
            volumes,
            last_price: item.last_price(),
            bid_price: item.bid_price(),
            ask_price: item.ask_price(),
        }
    }
}

impl<'a> From<&KlineItemRef<'a>> for KlineItemOwned {
    fn from(item_ref: &KlineItemRef<'a>) -> Self {
        match item_ref {
            KlineItemRef::Borrowed(item) => KlineItemOwned::from(item),
            KlineItemRef::Owned(item) => (*item).clone(),
        }
    }
}

// --- Unified Data Access Enum (Cow-like) ---

/// 统一的K线数据引用枚举。
///
/// 封装了对两种数据源的引用：
/// 1. `Borrowed`: 对来自原始 FlatBuffers 的零拷贝视图 (`&kline::KlineItem`)。
/// 2. `Owned`: 对存储在 `Vec` 中的自有数据 (`&KlineItemOwned`)。
///
/// 通过为该枚举实现所有数据访问方法，上层调用者（如渲染器）可以
/// 无差别地处理来自任何来源的数据，从而屏蔽了底层的存储差异。
#[derive(Debug, Clone)]
pub enum KlineItemRef<'a> {
    Borrowed(kline::KlineItem<'a>),
    Owned(&'a KlineItemOwned),
}

/// 迭代器，用于统一访问 `volumes` 字段。
pub enum VolumesIterator<'a> {
    Borrowed(flatbuffers::VectorIter<'a, flatbuffers::ForwardsUOffset<kline::PriceVolume<'a>>>),
    Owned(std::slice::Iter<'a, PriceVolumeOwned>),
}

impl<'a> Iterator for VolumesIterator<'a> {
    type Item = PriceVolumeRef<'a>;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            VolumesIterator::Borrowed(iter) => iter
                .next()
                .map(|price_volume| PriceVolumeRef::Borrowed(price_volume)),
            VolumesIterator::Owned(iter) => iter.next().map(PriceVolumeRef::Owned),
        }
    }
}

/// 统一的 PriceVolume 引用枚举。
#[derive(Debug, Clone)]
pub enum PriceVolumeRef<'a> {
    Borrowed(kline::PriceVolume<'a>),
    Owned(&'a PriceVolumeOwned),
}

impl<'a> PriceVolumeRef<'a> {
    pub fn price(&self) -> f64 {
        match self {
            PriceVolumeRef::Borrowed(pv) => pv.price(),
            PriceVolumeRef::Owned(pv) => pv.price,
        }
    }

    pub fn volume(&self) -> f64 {
        match self {
            PriceVolumeRef::Borrowed(pv) => pv.volume(),
            PriceVolumeRef::Owned(pv) => pv.volume,
        }
    }
}

// --- Accessor Implementations for KlineItemRef ---

impl<'a> KlineItemRef<'a> {
    pub fn timestamp(&self) -> i32 {
        match self {
            KlineItemRef::Borrowed(item) => item.timestamp(),
            KlineItemRef::Owned(item) => item.timestamp,
        }
    }

    pub fn open(&self) -> f64 {
        match self {
            KlineItemRef::Borrowed(item) => item.open(),
            KlineItemRef::Owned(item) => item.open,
        }
    }

    pub fn high(&self) -> f64 {
        match self {
            KlineItemRef::Borrowed(item) => item.high(),
            KlineItemRef::Owned(item) => item.high,
        }
    }

    pub fn low(&self) -> f64 {
        match self {
            KlineItemRef::Borrowed(item) => item.low(),
            KlineItemRef::Owned(item) => item.low,
        }
    }

    pub fn close(&self) -> f64 {
        match self {
            KlineItemRef::Borrowed(item) => item.close(),
            KlineItemRef::Owned(item) => item.close,
        }
    }

    pub fn b_vol(&self) -> f64 {
        match self {
            KlineItemRef::Borrowed(item) => item.b_vol(),
            KlineItemRef::Owned(item) => item.b_vol,
        }
    }

    pub fn s_vol(&self) -> f64 {
        match self {
            KlineItemRef::Borrowed(item) => item.s_vol(),
            KlineItemRef::Owned(item) => item.s_vol,
        }
    }

    pub fn volumes(&self) -> Option<VolumesIterator<'a>> {
        match self {
            KlineItemRef::Borrowed(item) => {
                item.volumes().map(|v| VolumesIterator::Borrowed(v.iter()))
            }
            KlineItemRef::Owned(item) => Some(VolumesIterator::Owned(item.volumes.iter())),
        }
    }

    pub fn last_price(&self) -> f64 {
        match self {
            KlineItemRef::Borrowed(item) => item.last_price(),
            KlineItemRef::Owned(item) => item.last_price,
        }
    }

    pub fn bid_price(&self) -> f64 {
        match self {
            KlineItemRef::Borrowed(item) => item.bid_price(),
            KlineItemRef::Owned(item) => item.bid_price,
        }
    }

    pub fn ask_price(&self) -> f64 {
        match self {
            KlineItemRef::Borrowed(item) => item.ask_price(),
            KlineItemRef::Owned(item) => item.ask_price,
        }
    }
}
