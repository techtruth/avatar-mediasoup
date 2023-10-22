import { Scene } from "@babylonjs/core/scene";

declare global {
  // var is mandatory for ts global declarations
  // `const` can be used if we omit the `global` prefix. Leaving as is to avoid ambiguity
  // eslint-disable-next-line no-var
  var scene: Scene;
  /** Google Calendar URL including https://. Defined by webpack config, originally set from branding.js. Needed for mainline-half of chrome extension. */
  const __GOOGLE_CALENDAR_URL__: string;
  const __TEST__: boolean;
  const __WEBPACK_DEVSERVER_PORT__: string;
  const cloudinary: any;
  type SketchfabModelData = {
    download: {
      gltf: {
        size: number;
        url: string;
      };
      glb: {
        size: number;
        url: string;
      };
    };
    model: {
      name: string;
      embedUrl: string;
      uid: string;
      user: {
        displayName: string;
        profileUrl: string;
      };
    };
  };
  interface SketchFabImporterOptions {
    onModelSelected: (modelData: SketchfabModelData) => void;
  }
  const SketchfabImporter: (
    el: Element | null,
    opts: SketchFabImporterOptions
  ) => void;

  const plausible: (...args: any[]) => void;
}

export {};
