import {
  // Float16Array,
  // isFloat16Array,
  // isTypedArray,
  getFloat16,
  setFloat16,
  f16round,
} from "@petamoriken/float16";

/* Object representing a movement frame */
export class MovementFrame {
  basePosX: number;
  basePosY: number;
  basePosZ: number;
  baseRotW: number;
  baseRotX: number;
  baseRotY: number;
  baseRotZ: number;
  headPosX: number;
  headPosY: number;
  headPosZ: number;
  headRotW: number;
  headRotX: number;
  headRotY: number;
  headRotZ: number;
  leftHandPosX: number;
  leftHandPosY: number;
  leftHandPosZ: number;
  leftHandRotW: number;
  leftHandRotX: number;
  leftHandRotY: number;
  leftHandRotZ: number;
  rightHandPosX: number;
  rightHandPosY: number;
  rightHandPosZ: number;
  rightHandRotW: number;
  rightHandRotX: number;
  rightHandRotY: number;
  rightHandRotZ: number;
  gamePiecePosX: number;
  gamePiecePosY: number;
  gamePiecePosZ: number;
  gamePieceRotW: number;
  gamePieceRotX: number;
  gamePieceRotY: number;
  gamePieceRotZ: number;
}

//Movement protocol binary markers (nibble*X)
// This is the byte-address of the value in the array.
// This will eventually no longer be needed,
//  as we shift to fully using the headers
export enum MovementAddress {
  //Header metadata for informing reader of sub-packets
  meta = 0,

  //POS/ROT of root transform
  basePosX = 2, // 4 bytes for float32, only for base position
  basePosY = 6, // ..
  basePosZ = 10, // ..
  baseRotW = 14,
  baseRotX = 16,
  baseRotY = 18,
  baseRotZ = 20,

  //POS/ROT of head object
  headPosX = 22,
  headPosY = 24,
  headPosZ = 26,
  headRotW = 28,
  headRotX = 30,
  headRotY = 32,
  headRotZ = 34,

  //POS/ROT of left hand object
  leftHandPosX = 36,
  leftHandPosY = 38,
  leftHandPosZ = 40,
  leftHandRotW = 42,
  leftHandRotX = 44,
  leftHandRotY = 46,
  leftHandRotZ = 48,

  //POS/ROT of right hand object
  rightHandPosX = 50,
  rightHandPosY = 52,
  rightHandPosZ = 54,
  rightHandRotW = 56,
  rightHandRotX = 58,
  rightHandRotY = 60,
  rightHandRotZ = 62,

  //Reserved for future use
  gamePiecePosX = 64,
  gamePiecePosY = 66,
  gamePiecePosZ = 68,
  gamePieceRotW = 70,
  gamePieceRotX = 72,
  gamePieceRotY = 74,
  gamePieceRotZ = 76,
}

// Movement protocol header values (2^X), 2 bytes
// This is the bit-value representation of the header.
// The header indicates the content of the payload this way
export enum PacketHeader {
  //Header metadata for informing reader of sub-packets
  basePos = 1, // 1st
  baseRot = 2, // 2nd
  headPos = 4, // 3rd
  headRot = 8, // 4th
  leftHandPos = 16, // 5th
  leftHandRot = 32, // 6th
  rightHandPos = 64, // 7th
  rightHandRot = 128, // 8th
  gamePiecePos = 256, // 9th
  gamePieceRot = 512, // 10th
  fullPacket = 1024, // 11th
  frequent = 2048, // 12th
  // 4 bits left for future or external use
}

export class MovementTransport {
  public sendMovement: { (movement: ArrayBuffer): void }; //Externally set
  lastSend: Date;
  sendInterval: number;
  timerId: number;
  sendBuffer: ArrayBuffer;
  sendPacket: DataView;
  sendFrame: MovementFrame;
  sendBufferBig: ArrayBuffer;
  sendBufferSmall: ArrayBuffer;
  inputHeader: Int16Array;

  constructor() {
    // The send buffer is 78 bytes if all fields are set
    // When we send, we slice it down (see startSendingMovement)
    this.sendBuffer = new ArrayBuffer(78);
    this.sendPacket = new DataView(this.sendBuffer);
    this.inputHeader = new Int16Array([0]);
    this.sendInterval = 100;
    console.debug("Movement send interval is ", this.sendInterval);
  }

  setInputHeaderBitIdempotently(header: Int16Array, bit: number): void {
    if (header[0] & bit) {
      return;
    }
    header[0] += bit;
  }

  setMovement(movement: MovementFrame): void {
    // These sets should allways be additive in their inputs.
    // Meaning if two setMovement are called before it is sent,
    // the values will be put into the same buffer and sent at the interval.
    // Calculate our meta header from which fields we have data for
    for (const field in movement) {
      if ((movement as any)[field] === undefined) {
        // allow partial updates using MovementFrame class by skipping undefined props
        continue;
      }
      // E.g. if field is basePosX, we set the basePos bit in the header
      this.setInputHeaderBitIdempotently(
        this.inputHeader,
        (PacketHeader as any)[field.slice(0, -1)]
      ); //Accumulate header bits

      if (
        field === "basePosX" ||
        field === "basePosY" ||
        field === "basePosZ"
      ) {
        // Base position is a special case, as the only float32s in the packet
        this.sendPacket.setFloat32(
          MovementAddress[field],
          movement[field],
          true
        ); //Set packet data
      } else {
        const value = f16round((movement as any)[field]);
        setFloat16(this.sendPacket, MovementAddress[field], value, true);
      }
    }

    // Set the header fullPacket bit, if we have hand or game piece pos/rot
    if (
      this.inputHeader[0] &
      (PacketHeader.leftHandPos |
        PacketHeader.rightHandPos |
        PacketHeader.gamePiecePos)
    ) {
      this.inputHeader[0] += PacketHeader.fullPacket;
    }
    // The fullPacket bit is also used on the movement server itself

    // Add input header to existing frame header
    this.sendPacket.setInt16(MovementAddress.meta, this.inputHeader[0], true);
  }

  startSendingMovement(): void {
    this.timerId = window.setTimeout(() => {
      const header = this.sendPacket.getInt16(MovementAddress.meta, true);
      if (
        (header & PacketHeader.basePos && header & PacketHeader.fullPacket) ||
        window.location.search.includes("full")
      ) {
        // Both the/a hand and the base pos are set (or game piece), so we need the big buffer
        this.sendMovement(this.sendBuffer);
      } else if (header & PacketHeader.basePos && header < 15) {
        // Only the base pos is set, so we can use the small buffer
        // Get data from the big buffer to the small buffer
        this.sendBufferSmall = this.sendBuffer.slice(0, 36);
        this.sendMovement(this.sendBufferSmall);
      }
      this.clearBuffer(); //Clear the buffer for next time
      this.inputHeader = new Int16Array([0]); //Clear the header for next time
      this.startSendingMovement(); //Re-call this function
    }, this.sendInterval);
  }

  stopSendingMovement(): void {
    clearTimeout(this.timerId);
  }

  isSendingMovement(): boolean {
    return this.timerId !== undefined;
  }

  clearBuffer(): void {
    this.sendPacket.setInt16(MovementAddress.meta, 0);

    //Base position
    this.sendPacket.setFloat32(MovementAddress.basePosX, 0.0);
    this.sendPacket.setFloat32(MovementAddress.basePosY, 0.0);
    this.sendPacket.setFloat32(MovementAddress.basePosZ, 0.0);

    //Base rotation
    setFloat16(this.sendPacket, MovementAddress.baseRotW, 0.0);
    setFloat16(this.sendPacket, MovementAddress.baseRotW, 0.0);
    setFloat16(this.sendPacket, MovementAddress.baseRotX, 0.0);
    setFloat16(this.sendPacket, MovementAddress.baseRotY, 0.0);
    setFloat16(this.sendPacket, MovementAddress.baseRotZ, 0.0);

    //Head position TODO: implement soon
    setFloat16(this.sendPacket, MovementAddress.headPosX, 0.0);
    setFloat16(this.sendPacket, MovementAddress.headPosY, 0.0);
    setFloat16(this.sendPacket, MovementAddress.headPosZ, 0.0);

    //Head rotation
    setFloat16(this.sendPacket, MovementAddress.headRotW, 0.0);
    setFloat16(this.sendPacket, MovementAddress.headRotX, 0.0);
    setFloat16(this.sendPacket, MovementAddress.headRotY, 0.0);
    setFloat16(this.sendPacket, MovementAddress.headRotZ, 0.0);

    //Left Hand position
    setFloat16(this.sendPacket, MovementAddress.leftHandPosX, 0.0);
    setFloat16(this.sendPacket, MovementAddress.leftHandPosY, 0.0);
    setFloat16(this.sendPacket, MovementAddress.leftHandPosZ, 0.0);

    //Left Hand rotation
    setFloat16(this.sendPacket, MovementAddress.leftHandRotW, 0.0);
    setFloat16(this.sendPacket, MovementAddress.leftHandRotX, 0.0);
    setFloat16(this.sendPacket, MovementAddress.leftHandRotY, 0.0);
    setFloat16(this.sendPacket, MovementAddress.leftHandRotZ, 0.0);

    //Right Hand position
    setFloat16(this.sendPacket, MovementAddress.rightHandPosX, 0.0);
    setFloat16(this.sendPacket, MovementAddress.rightHandPosY, 0.0);
    setFloat16(this.sendPacket, MovementAddress.rightHandPosZ, 0.0);

    //Right Hand rotation
    setFloat16(this.sendPacket, MovementAddress.rightHandRotW, 0.0);
    setFloat16(this.sendPacket, MovementAddress.rightHandRotX, 0.0);
    setFloat16(this.sendPacket, MovementAddress.rightHandRotY, 0.0);
    setFloat16(this.sendPacket, MovementAddress.rightHandRotZ, 0.0);

    //Carried object position
    setFloat16(this.sendPacket, MovementAddress.gamePiecePosX, 0.0);
    setFloat16(this.sendPacket, MovementAddress.gamePiecePosY, 0.0);
    setFloat16(this.sendPacket, MovementAddress.gamePiecePosZ, 0.0);

    //Carried object rotation
    setFloat16(this.sendPacket, MovementAddress.gamePieceRotW, 0.0);
    setFloat16(this.sendPacket, MovementAddress.gamePieceRotX, 0.0);
    setFloat16(this.sendPacket, MovementAddress.gamePieceRotY, 0.0);
    setFloat16(this.sendPacket, MovementAddress.gamePieceRotZ, 0.0);
  }
}

type AvatarMovement = {
  type: "avatar";
  frequent: boolean;
  position: {
    x: number;
    y: number;
    z: number;
  };
  bodyRot: number[];
  rotation: number[];
  gamePiecePosition?: {
    x: number;
    y: number;
    z: number;
  };
  gamePieceRotation?: {
    x: number;
    y: number;
    z: number;
  };
};

type HandMovement = {
  type: "left" | "right";
  position: number[];
  rotation: number[];
};

export type MovementArray = (AvatarMovement | HandMovement | HandMovement)[];

/* Used to transcribe incoming movement data to JSON
    This is not needed by the sending side, only receiving. */
export function movementToJSON(arrayBuffer: ArrayBuffer): MovementArray {
  //Preserved structure, needs to change
  const dataView = new DataView(arrayBuffer);
  const movementArray = [] as MovementArray; //TODO: make obsolete
  const header = dataView.getInt16(MovementAddress.meta, true);
  // Check header if bit according to PacketHeader.basePos is set
  if (header & PacketHeader.basePos) {
    const movementObject = {
      type: "avatar" as const,
      frequent: (header & PacketHeader.frequent) != 0,
      position: {
        x: dataView.getFloat32(MovementAddress.basePosX, true),
        y: dataView.getFloat32(MovementAddress.basePosY, true),
        z: dataView.getFloat32(MovementAddress.basePosZ, true),
      },
      bodyRot: [
        getFloat16(dataView, MovementAddress.baseRotX, true),
        getFloat16(dataView, MovementAddress.baseRotY, true),
        getFloat16(dataView, MovementAddress.baseRotZ, true),
        getFloat16(dataView, MovementAddress.baseRotW, true),
      ],
      rotation: [
        getFloat16(dataView, MovementAddress.headRotX, true),
        getFloat16(dataView, MovementAddress.headRotY, true),
        getFloat16(dataView, MovementAddress.headRotZ, true),
        getFloat16(dataView, MovementAddress.headRotW, true),
      ],
    };
    if (header & PacketHeader.gamePiecePos) {
      Object.assign(movementObject, {
        gamePiecePosition: {
          x: getFloat16(dataView, MovementAddress.gamePiecePosX, true),
          y: getFloat16(dataView, MovementAddress.gamePiecePosY, true),
          z: getFloat16(dataView, MovementAddress.gamePiecePosZ, true),
        },
        gamePieceRotation: {
          x: getFloat16(dataView, MovementAddress.gamePieceRotX, true),
          y: getFloat16(dataView, MovementAddress.gamePieceRotY, true),
          z: getFloat16(dataView, MovementAddress.gamePieceRotZ, true),
          w: getFloat16(dataView, MovementAddress.gamePieceRotW, true),
        },
      });
    }
    movementArray[0] = movementObject;
  }

  // Hack in the hands
  // TODO: move this to protocol and not arrays of objects
  // we wouldn't want to check local state to see whether remote peer hands are on...
  if (header & PacketHeader.leftHandPos) {
    const leftHand = {
      type: "left" as const,
      position: [
        getFloat16(dataView, MovementAddress.leftHandPosX, true),
        getFloat16(dataView, MovementAddress.leftHandPosY, true),
        getFloat16(dataView, MovementAddress.leftHandPosZ, true),
      ],
      rotation: [
        getFloat16(dataView, MovementAddress.leftHandRotX, true),
        getFloat16(dataView, MovementAddress.leftHandRotY, true),
        getFloat16(dataView, MovementAddress.leftHandRotZ, true),
        getFloat16(dataView, MovementAddress.leftHandRotW, true),
      ],
    };
    movementArray.push(leftHand);
  }
  if (header & PacketHeader.rightHandPos) {
    const rightHand = {
      type: "right" as const,
      position: [
        getFloat16(dataView, MovementAddress.rightHandPosX, true),
        getFloat16(dataView, MovementAddress.rightHandPosY, true),
        getFloat16(dataView, MovementAddress.rightHandPosZ, true),
      ],
      rotation: [
        getFloat16(dataView, MovementAddress.rightHandRotX, true),
        getFloat16(dataView, MovementAddress.rightHandRotY, true),
        getFloat16(dataView, MovementAddress.rightHandRotZ, true),
        getFloat16(dataView, MovementAddress.rightHandRotW, true),
      ],
    };
    movementArray.push(rightHand);
  }
  return movementArray;
}
// A useful utility when debugging the protocol, please don't remove
// export const debugPacketHeader = (header: number) => {
//   const headerString = header.toString(2).padStart(16, "0");
//   console.log(headerString);
//   Object.keys(PacketHeader).forEach((key) => {
//     const value = PacketHeader[key as keyof typeof PacketHeader];
//     console.log(key, value, (header & value) != 0);
//   });
// };
