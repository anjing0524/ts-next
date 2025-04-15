// automatically generated by the FlatBuffers compiler, do not modify

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import * as flatbuffers from 'flatbuffers';

export class PriceVolume {
  bb: flatbuffers.ByteBuffer | null = null;
  bb_pos = 0;
  __init(i: number, bb: flatbuffers.ByteBuffer): PriceVolume {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }

  static getRootAsPriceVolume(bb: flatbuffers.ByteBuffer, obj?: PriceVolume): PriceVolume {
    return (obj || new PriceVolume()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }

  static getSizePrefixedRootAsPriceVolume(
    bb: flatbuffers.ByteBuffer,
    obj?: PriceVolume
  ): PriceVolume {
    bb.setPosition(bb.position() + flatbuffers.SIZE_PREFIX_LENGTH);
    return (obj || new PriceVolume()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }

  price(): number {
    const offset = this.bb!.__offset(this.bb_pos, 4);
    return offset ? this.bb!.readFloat64(this.bb_pos + offset) : 0.0;
  }

  volume(): number {
    const offset = this.bb!.__offset(this.bb_pos, 6);
    return offset ? this.bb!.readFloat64(this.bb_pos + offset) : 0.0;
  }

  static startPriceVolume(builder: flatbuffers.Builder) {
    builder.startObject(2);
  }

  static addPrice(builder: flatbuffers.Builder, price: number) {
    builder.addFieldFloat64(0, price, 0.0);
  }

  static addVolume(builder: flatbuffers.Builder, volume: number) {
    builder.addFieldFloat64(1, volume, 0.0);
  }

  static endPriceVolume(builder: flatbuffers.Builder): flatbuffers.Offset {
    const offset = builder.endObject();
    return offset;
  }

  static createPriceVolume(
    builder: flatbuffers.Builder,
    price: number,
    volume: number
  ): flatbuffers.Offset {
    PriceVolume.startPriceVolume(builder);
    PriceVolume.addPrice(builder, price);
    PriceVolume.addVolume(builder, volume);
    return PriceVolume.endPriceVolume(builder);
  }
}
