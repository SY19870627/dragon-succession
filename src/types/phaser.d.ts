declare module "phaser" {
  namespace Phaser {
    namespace Types {
      namespace Core {
        interface ScaleConfig {
          width?: number;
          height?: number;
          mode?: number;
          autoCenter?: number;
        }

        interface GameConfig {
          type: number;
          parent?: string;
          width?: number;
          height?: number;
          backgroundColor?: number | string;
          title?: string;
          scene?: unknown;
          physics?: unknown;
          scale?: ScaleConfig;
          render?: unknown;
        }
      }

      namespace Tweens {
        interface TweenBuilderConfig {
          targets: unknown;
          duration?: number;
          repeat?: number;
          yoyo?: boolean;
          ease?: string;
          alpha?: number | { from?: number; to?: number };
          scaleX?: number | { from?: number; to?: number };
          scaleY?: number | { from?: number; to?: number };
          onComplete?: TweenCallback;
        }

        type TweenCallback = (tween: Phaser.Tweens.Tween, targets: unknown[]) => void;
      }
    }

    namespace Events {
      class EventEmitter {
        on<TArgs extends unknown[]>(
          event: string | symbol,
          fn: (...args: TArgs) => void,
          context?: unknown
        ): this;
        once<TArgs extends unknown[]>(
          event: string | symbol,
          fn: (...args: TArgs) => void,
          context?: unknown
        ): this;
        off<TArgs extends unknown[]>(
          event: string | symbol,
          fn: (...args: TArgs) => void,
          context?: unknown,
          once?: boolean
        ): this;
        emit<TArgs extends unknown[]>(event: string | symbol, ...args: TArgs): boolean;
        removeAllListeners(event?: string | symbol): this;
      }
    }

    namespace GameObjects {
      class GameObject extends Phaser.Events.EventEmitter {
        constructor(scene: Phaser.Scene, type: string);
        scene: Phaser.Scene;
        active: boolean;
        visible: boolean;
        depth: number;
        x: number;
        y: number;
        width: number;
        height: number;
        displayWidth: number;
        displayHeight: number;
        getBounds(output?: Phaser.Geom.Rectangle): Phaser.Geom.Rectangle;
        setInteractive(hitArea?: unknown, hitAreaCallback?: unknown, dropZone?: boolean): this;
        setInteractive(options?: unknown): this;
        removeInteractive(): this;
        disableInteractive(): this;
        setDepth(value: number): this;
        setAlpha(value: number): this;
        setVisible(value: boolean): this;
        setPosition(x: number, y?: number): this;
        setScale(x: number, y?: number): this;
        setScrollFactor(x: number, y?: number): this;
        setActive(state: boolean): this;
        setDataEnabled(): this;
        setData(key: string, value: unknown): this;
        getData(key: string): unknown;
        destroy(fromScene?: boolean): void;
      }

      namespace Events {
        const DESTROY: string;
      }

      interface TextStyle {
        fontFamily?: string;
        fontSize?: string | number;
        fontStyle?: string;
        color?: string;
        align?: string;
        wordWrap?: { width?: number; useAdvancedWrap?: boolean };
        fixedWidth?: number;
      }

      class Text extends GameObject {
        constructor(scene: Phaser.Scene, x: number, y: number, text: string | string[], style?: TextStyle);
        text: string;
        setText(value: string | string[]): this;
        setFontSize(size: number | string): this;
        setFontStyle(style: string): this;
        setColor(color: string): this;
        setOrigin(x: number, y?: number): this;
        setPadding(x?: number, y?: number): this;
        setWordWrapWidth(width: number, useAdvancedWrap?: boolean): this;
        setAlign(align: string): this;
      }

      class Rectangle extends GameObject {
        constructor(
          scene: Phaser.Scene,
          x: number,
          y: number,
          width: number,
          height: number,
          fillColor?: number,
          fillAlpha?: number
        );
        width: number;
        height: number;
        fillColor: number;
        fillAlpha: number;
        setOrigin(x: number, y?: number): this;
        setStrokeStyle(lineWidth: number, color?: number, alpha?: number): this;
        setFillStyle(color: number, alpha?: number): this;
        setSize(width: number, height: number): this;
        setDisplaySize(width: number, height: number): this;
      }

      class Image extends GameObject {
        constructor(
          scene: Phaser.Scene,
          x: number,
          y: number,
          texture: string,
          frame?: string | number
        );
        setOrigin(x: number, y?: number): this;
        setTexture(key: string, frame?: string | number): this;
        setTint(topLeft: number, topRight?: number, bottomLeft?: number, bottomRight?: number): this;
      }

      class Graphics extends GameObject {
        fillStyle(color: number, alpha?: number): this;
        lineStyle(lineWidth: number, color?: number, alpha?: number): this;
        lineBetween(x1: number, y1: number, x2: number, y2: number): this;
        strokeRect(x: number, y: number, width: number, height: number): this;
        strokeRoundedRect(
          x: number,
          y: number,
          width: number,
          height: number,
          radius?: number | number[] | Record<string, number>
        ): this;
        fillRect(x: number, y: number, width: number, height: number): this;
        fillRoundedRect(
          x: number,
          y: number,
          width: number,
          height: number,
          radius?: number | number[] | Record<string, number>
        ): this;
        fillCircle(x: number, y: number, radius: number): this;
        strokeCircle(x: number, y: number, radius: number): this;
        generateTexture(key: string, width?: number, height?: number): this;
        clear(): this;
      }

      class Container extends GameObject {
        constructor(scene: Phaser.Scene, x?: number, y?: number, children?: GameObject | GameObject[]);
        list: GameObject[];
        add(child: GameObject | GameObject[]): this;
        remove(child: GameObject, destroyChild?: boolean): this;
        removeAll(destroyChildren?: boolean): this;
        destroy(fromScene?: boolean, destroyChildren?: boolean): void;
        setSize(width: number, height: number): this;
        setScrollFactor(x: number, y?: number): this;
        setDepth(value: number): this;
        setAlpha(value: number): this;
        setActive(state: boolean): this;
      }

      interface GameObjectFactory {
        container(x?: number, y?: number, children?: GameObject | GameObject[]): Container;
        text(x: number, y: number, text: string | string[], style?: TextStyle): Text;
        image(
          x: number,
          y: number,
          texture: string,
          frame?: string | number
        ): Image;
        rectangle(
          x: number,
          y: number,
          width: number,
          height: number,
          fillColor?: number,
          fillAlpha?: number
        ): Rectangle;
        graphics(config?: unknown): Graphics;
        existing<T extends GameObject>(gameObject: T): T;
      }

      interface DisplayList {
        bringToTop(child: GameObject): this;
      }
    }

    namespace Loader {
      namespace Events {
        const PROGRESS: string;
        const COMPLETE: string;
      }

      class LoaderPlugin extends Phaser.Events.EventEmitter {
        image(key: string, url: string): this;
        audio(key: string, urls: string | string[]): this;
        atlas(key: string, textureURL: string, atlasURL: string): this;
        start(): this;
      }
    }

    namespace Tweens {
      class Tween {
        stop(): void;
      }

      class TweenManager {
        add(config: Types.Tweens.TweenBuilderConfig): Tween;
      }
    }

    namespace Time {
      class Clock {
        now: number;
        delayedCall(
          delay: number,
          callback: (...args: unknown[]) => void,
          args?: unknown[],
          context?: unknown
        ): unknown;
      }
    }

    namespace Textures {
      class TextureManager {
        exists(key: string): boolean;
        remove(key: string): void;
      }
    }

    namespace Scenes {
      namespace Events {
        const WAKE: string;
        const RESUME: string;
        const SLEEP: string;
        const SHUTDOWN: string;
      }

      class ScenePlugin {
        isActive(key: string): boolean;
        isSleeping(key: string): boolean;
        isPaused(key: string): boolean;
        launch(key: string, data?: unknown): this;
        wake(key: string): this;
        sleep(key: string): this;
        stop(key: string): this;
        bringToTop(key: string): this;
        pause(key?: string): this;
        resume(key?: string): this;
        start(key: string, data?: unknown): this;
      }
    }

    namespace Cameras {
      namespace Scene2D {
        class Camera {
          setBackgroundColor(color: number | string): this;
          centerOn(x: number, y: number): this;
          setScroll(x: number, y: number): this;
        }

        class CameraManager {
          main: Camera;
        }
      }
    }

    namespace Geom {
      class Circle {
        constructor(x: number, y: number, radius: number);
        setTo(x: number, y: number, radius: number): this;
        static Contains(circle: Circle, x: number, y: number): boolean;
      }

      class Rectangle {
        constructor(x: number, y: number, width: number, height: number);
        x: number;
        y: number;
        width: number;
        height: number;
        setTo(x: number, y: number, width: number, height: number): this;
        static Contains(rect: Rectangle, x: number, y: number): boolean;
      }
    }

    namespace Scale {
      const FIT: number;
      const CENTER_BOTH: number;

      class ScaleManager {
        width: number;
        height: number;
        mode: number;
        autoCenter: number;
      }
    }

    namespace Input {
      namespace Events {
        const GAMEOBJECT_POINTER_OVER: string;
        const GAMEOBJECT_POINTER_OUT: string;
        const GAMEOBJECT_POINTER_UP: string;
        const GAMEOBJECT_POINTER_DOWN: string;
      }
    }

    class Game extends Events.EventEmitter {
      constructor(config: Types.Core.GameConfig);
      destroy(removeCanvas?: boolean): void;
    }

    class Scene extends Events.EventEmitter {
      constructor(config?: string);
      add: GameObjects.GameObjectFactory;
      events: Events.EventEmitter;
      scene: Scenes.ScenePlugin;
      scale: Scale.ScaleManager;
      textures: Textures.TextureManager;
      load: Loader.LoaderPlugin;
      time: Time.Clock;
      tweens: Tweens.TweenManager;
      cameras: Cameras.Scene2D.CameraManager;
      children: GameObjects.DisplayList;
      input: { enabled: boolean };
      sys: { settings: { key: string } };
      preload?(): void;
      create?(): void;
      update?(time: number, delta: number): void;
    }

    const AUTO: number;
  }

  interface PhaserInstance {
    AUTO: number;
    Scene: typeof Phaser.Scene;
    Game: typeof Phaser.Game;
    Events: typeof Phaser.Events;
    GameObjects: typeof Phaser.GameObjects;
    Loader: typeof Phaser.Loader;
    Tweens: typeof Phaser.Tweens;
    Time: typeof Phaser.Time;
    Textures: typeof Phaser.Textures;
    Scenes: typeof Phaser.Scenes;
    Cameras: typeof Phaser.Cameras;
    Geom: typeof Phaser.Geom;
    Scale: typeof Phaser.Scale;
    Types: typeof Phaser.Types;
  }

  const Phaser: PhaserInstance;

  export default Phaser;
}
