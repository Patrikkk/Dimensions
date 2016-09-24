import Item from './item';
import Client from './client';
import { PacketFactory } from './utils';
import PacketTypes from './packettypes';
import Color from './color';

class Player {
	client: Client | null;
	id: number;
	name: string;
	inventory: Item[];
	life: number;
	mana: number;
	allowedNameChange: boolean;
	allowedCharacterChange: boolean;
	allowedLifeChange: boolean;
	allowedManaChange: boolean;

	// Visuals
	skinVariant: number;
	hair: number;
	hairDye: number;
	hideVisuals: number;
	hideVisuals2: number;
	hideMisc: number;
	hairColor: Color;
	skinColor: Color;
	eyeColor: Color;
	shirtColor: Color;
	underShirtColor: Color;
	pantsColor: Color;
	shoeColor: Color;

	// Soft/Med/Hard core
	difficulty: number;

	constructor(client: Client | null) {
		this.client = client;
		this.id = 0;
		this.name = "";
		this.life = 100;
		this.mana = 20;
		this.allowedNameChange = false;
		this.allowedCharacterChange = false;

		// Inventory of Client - only used for SSC -> to Non-SSC switching
		this.inventory = [];
	}

	setItem(item: Item): void {
		if (this.client === null) {
			return;
		}

		let playerInventorySlot: string = (new PacketFactory())
			.setType(PacketTypes.PlayerInventorySlot)
			.packByte(this.id)
			.packByte(item.slot)
			.packInt16(item.stack)
			.packByte(item.prefix)
			.packInt16(item.netID)
			.data();

		this.client.socket.write(new Buffer(playerInventorySlot, 'hex'));
  	}

	setLife(life: number): void {
		if (this.client === null) {
			return;
		}

		let playerLife: string = (new PacketFactory())
			.setType(PacketTypes.PlayerMana)
			.packByte(this.id)
			.packInt16(this.life)
			.packInt16(this.life)
			.data();

		this.client.socket.write(new Buffer(playerLife, 'hex'));
	}

	setMana(mana: number): void {
		if (this.client === null) {
			return;
		}

		let playerMana: string = (new PacketFactory())
			.setType(PacketTypes.PlayerMana)
			.packByte(this.id)
			.packInt16(this.mana)
			.packInt16(this.mana)
			.data();

		this.client.socket.write(new Buffer(playerMana, 'hex'));
	}

	setVisuals(): void {
		if (this.client === null) {
			return;
		}

		let playerInfo: string = (new PacketFactory())
			.setType(PacketTypes.PlayerInfo)
			.packByte(this.id)
			.packByte(this.skinVariant)
			.packByte(this.hair)
			.packString(this.name)
			.packByte(this.hairDye)
			.packByte(this.hideVisuals)
			.packByte(this.hideVisuals2)
			.packByte(this.hideMisc)
			.packColor(this.hairColor)
			.packColor(this.skinColor)
			.packColor(this.eyeColor)
			.packColor(this.shirtColor)
			.packColor(this.underShirtColor)
			.packColor(this.pantsColor)
			.packColor(this.shoeColor)
			.packByte(this.difficulty)
			.data()

		this.client.socket.write(new Buffer(playerInfo, 'hex'));
	}
}

export default Player;