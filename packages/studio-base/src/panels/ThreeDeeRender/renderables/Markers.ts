// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as THREE from "three";

import { Renderer } from "../Renderer";
import { Marker } from "../ros";
import { LayerSettingsMarker, LayerType } from "../settings";
import { TopicMarkers } from "./TopicMarkers";

export class Markers extends THREE.Object3D {
  renderer: Renderer;
  topics = new Map<string, TopicMarkers>();

  constructor(renderer: Renderer) {
    super();
    this.renderer = renderer;

    renderer.setSettingsFieldsProvider(LayerType.Marker, (topicConfig) => {
      const cur = topicConfig as Partial<LayerSettingsMarker>;
      return { color: { label: "Color", input: "rgba", value: cur.color } };
    });
  }

  dispose(): void {
    for (const topicMarker of this.topics.values()) {
      topicMarker.dispose();
    }
    this.topics.clear();
  }

  addMarkerMessage(topic: string, marker: Marker): void {
    let topicMarkers = this.topics.get(topic);
    if (!topicMarkers) {
      topicMarkers = new TopicMarkers(topic, this.renderer);
      this.topics.set(topic, topicMarkers);
      this.add(topicMarkers);
    }
    topicMarkers.addMarkerMessage(marker);
  }

  setTopicSettings(topic: string, settings: Partial<LayerSettingsMarker>): void {
    const renderable = this.topics.get(topic);
    if (renderable) {
      renderable.userData.settings = { ...renderable.userData.settings, ...settings };
    }
  }

  startFrame(currentTime: bigint): void {
    const renderFrameId = this.renderer.renderFrameId;
    const fixedFrameId = this.renderer.fixedFrameId;
    if (renderFrameId == undefined || fixedFrameId == undefined) {
      this.visible = false;
      return;
    }
    this.visible = true;

    for (const topicMarker of this.topics.values()) {
      topicMarker.startFrame(currentTime, renderFrameId, fixedFrameId);
    }
  }
}
