// https://closure-compiler.appspot.com/home
/*==================================
		定数
==================================*/
// 入力され得る搭載数の最大値
const MAX_SLOT = 99;

// 画像置き場 プリロード用
const IMAGES = {};

// 一覧用
/** @type {ItemDetail[]} */
const ITEM_LIST = [];

//　航空戦火力キャップ 170
const AS_CAP = 170;

// 火力計算用
const ST3_MAX_SLOT = 999;
/*==================================
		グローバル変数
==================================*/

// 敵st1撃墜テーブル
let SHOOT_DOWN_TABLE_ENEMY;

// 制空状態テーブル
let AIR_STATUS_TABLE;

// 各種モーダルの値返却先
let $target = null;

// ドラッグ要素範囲外フラグ
let isOut = false;

// 防空モードフラグ
let isDefMode = false;

// 交戦回数
let battleCount = 1;

// 結果表示戦闘
let displayBattle = 0;

// イベント発生用タイマー
let timer = false;

// 機体プリセット
let planePreset = null;

// 熟練度 >> 選択時、内部熟練度を 120 として計算するもの
let initialProf120Plane = [];

// controlキー状態
let isCtrlPress = false;

// メモリ解放用タイマー
let releaseTimer = null;

// 配備機体
let usedItems = [];

// 編成済み艦娘
let usedShip = [];

// 陣形選択
let selectedFormations = []

// 基地空襲被害を促すアラート
let needAirRaidAlert = false;

// Chart描画用データ
let chartInstance = null;
let subChartInstance = null;
/** @type {{slot: number, rate: number}[]} */
let chartSlotDistribution = null;

// 計算結果格納オブジェクト
let resultData = {
	enemyAirPowers: [],
	enemyAirPowerResults: [],
	enemySlots: [],
	enemySlotAllDead: [],
	landBaseAirPowers: [],
	landBaseAirStatus: [],
	fleetAirPower: 0,
	fleetAirStatus: [],
	fleetSlots: [],
	defenseAirPower: 0,
	usedSteels: 0
};

// 航空戦火力計算用設定値
let aerialSetting = {
	item: null,
	a11: 1,
	contactBonus: 1,
	isUnion: false,
	unionBonus: 1,
	nishikiBonus: 1,
	isCritical: false,
	levelCriticalBonus: 1,
	ammoBonus: 1,
	isAllSlot: false,
	manualSlot: -1,
	manualRemodel: 0,
	targetEnemies: []
}

let errorInfo = null;

// 海域情報
let ENEMY_PATTERN = [];

// 裏で保持用
/** @type {Ship[]} */
let reserveList = null;

/** @type {Ship} */
let currentReserved = null;

/**
 * 計算用入力データオブジェクトクラス
 * @class InputData
 */
class InputData {
	constructor() {
		/** @type {LandBaseAll} */
		this.landBase = null;
		/** @type {Fleet} */
		this.fleet = null;
		/** @type {BattleData} */
		this.battleInfo = null;
	}
}

/** @type {InputData} */
let inputItems = new InputData();

class SpecialOperator {
	constructor() {
		/** @type {string} 選択されている特効区分 */
		this.selectedMode = '';
		/** @type {SpecialItemInfo[]} 特効情報クラスリスト */
		this.specialInfo = [];
		/** @type {boolean} 特効装備あるかどうか */
		this.enabled = false;
	}

	/**
	 * 特効表示更新
	 * @param {string} mode 特効区分 見つからなければデータクリア
	 * @memberof SpecialOperator
	 */
	update(mode) {
		this.selectedMode = mode;
		this.specialInfo = [];
		this.enabled = false;

		const sp = SPECIAL_DATA.find(v => v.mode === mode);
		if (sp) {
			this.enabled = true;
			for (const s of sp.special) {
				this.specialInfo.push(new SpecialItemInfo(s.name, s.remarks, s.items));
			}
		}
	}
}

class SpecialItemInfo {
	constructor(name, remarks, items) {
		/** @type {string} 特効名 */
		this.name = name;
		/** @type {string} 特効名サブ */
		this.remarks = remarks;
		/** @type {number[]} 該当装備id */
		this.items = items;
	}
}

/** @type {SpecialOperator} 特効表示情報管理変数 */
const specialOperator = new SpecialOperator();

/**
 * 艦隊入力情報クラス
 * @class Fleet
 */
class Fleet {
	constructor() {
		/** @type {Ship[]} */
		this.ships = [];
		/** @type {number} */
		this.airPower = 0;
		/** @type {number} */
		this.fullAirPower = 0;
		/** @type {number} */
		this.unionAirPower = 0;
		/** @type {number} */
		this.fullUnionAirPower = 0;
		/** @type {number} */
		this.escortAirPower = 0;
		/** @type {number} */
		this.fullEscortAirPower = 0;
		/** @type {boolean} */
		this.hasJet = false;
		/** @type {boolean} */
		this.isUnion = false;
		/** @type {number[]} 索敵スコア 各要素係数1 ~ 4 */
		this.scoutScores = []
		/** @type {number} 司令部レベル */
		this.adminLevel = 120;
		/** @type {FleetStage2[]} */
		this.allStage2 = [];
		/** @type {number} */
		this.antiAirBonus = 0;
		// /** @type {number} */
		// this.antiAirBonus_kai = 0;
	}

	/**
	 * 制空値の更新
	 * @memberof Fleet
	 */
	updateAirPower() {
		this.unionAirPower = 0;
		this.airPower = 0;
		this.escortAirPower = 0;

		for (const ship of this.ships) {
			// 全体
			this.unionAirPower += ship.airPower;
			if (!ship.isEscort) {
				this.airPower += ship.airPower;
			}
			else {
				this.escortAirPower += ship.airPower;
			}
		}
	}

	/**
	 * 補給状態の制空値を現在の値で置き換える
	 * @memberof Fleet
	 */
	initFullAirPower() {
		this.fullAirPower = this.airPower;
		this.fullEscortAirPower = this.escortAirPower;
		this.fullUnionAirPower = this.unionAirPower;
	}

	/**
	 * この艦隊の夜偵発動率
	 * @memberof Fleet
	 */
	nightContactRate() {
		let sum = 1;
		for (const ship of this.ships) {
			if (!this.isUnion || (this.isUnion && ship.isEscort)) {
				for (const plane of ship.items.filter(v => v.id === 102 && v.slot > 0)) {
					// 連続で成功しない確率をとっていく
					sum *= (1 - Math.floor(Math.sqrt(ship.level) * Math.sqrt(plane.scout)) / 25);
				}
			}
		}
		// 失敗しない確率
		return 1 - sum;
	}

	/**
	 * 結果保持用オブジェクトの初期化
	 * @memberof Fleet
	 */
	clearResult() {
		for (const ship of this.ships) {
			for (const plane of ship.items) {
				plane.results = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
			}
		}
	}

	/**
	 * このインスタンスの艦隊全体の対空砲火テーブルを生成
	 * 引数未指定の場合はそれぞれ 単縦 空襲なし
	 * @param {number} [formationId=1] 陣形id
	 * @param {boolean} [isAirRaid=false] 空襲マスかどうか
	 * @memberof Fleet
	 */
	updateStage2All(formationId = 1, isAirRaid = false) {
		// 初期化
		this.allStage2 = [];

		let generalCutin = [];
		let specialCutin = [];

		// 対空CI発動優先ソート用に一時格納
		for (const ship of this.ships) {
			for (const cutin of ship.antiAirCutIn) {
				if (cutin.id >= 34 && cutin.id !== 36) specialCutin.push(cutin);
				else generalCutin.push(cutin);
			}
		}
		// 特殊CIソート => (性能順, 38種以降)
		specialCutin.sort((a, b) => a.rateCorr !== b.rateCorr ? b.rateCorr - a.rateCorr : b.fixCorr - a.fixCorr);
		// 通常CIソート => (種別の降順)
		generalCutin.sort((a, b) => b.id - a.id);

		// 特殊CIを最優先とし、後続に通常CIを格納した対空CI配列　これで対空CI確定
		const allCutin = specialCutin.concat(generalCutin);

		// 最終的な各カットインと発動率の算出
		let sum = 1.0;
		let tempBorder = 0;
		for (const cutin of allCutin) {
			const cutinRate = sum * cutin.rate;
			sum -= cutinRate;
			tempBorder += cutinRate;

			// この設定で対空放火情報を計算
			this.updateStage2(formationId, cutin, isAirRaid);

			const stage2 = new FleetStage2();
			stage2.cutin = cutin;
			stage2.rate = cutinRate;
			stage2.border = tempBorder;

			for (let index = 0; index < this.ships.length; index++) {
				const ship = this.ships[index];
				const status = new ShootDownStatus();
				status.rateDown = ship.rateDown;
				status.fixDown = ship.fixDown;
				status.minimumDown = ship.minimumDown;
				stage2.table.push(status);
			}

			this.allStage2.push(stage2);
		}

		// 不発用のデータを挿入
		if (tempBorder < 100) {
			const noneCutin = new AntiAirCutIn();
			// この設定で対空放火情報を計算 (単縦 not対空CI not空襲)
			this.updateStage2(formationId, noneCutin, isAirRaid);

			const stage2 = new FleetStage2();
			stage2.cutin = noneCutin;
			stage2.rate = sum;
			stage2.border = 1.0;

			for (let i = 0; i < this.ships.length; i++) {
				const ship = this.ships[i];
				const status = new ShootDownStatus();
				status.rateDown = ship.rateDown;
				status.fixDown = ship.fixDown;
				status.minimumDown = ship.minimumDown;
				stage2.table.push(status);
			}

			this.allStage2.push(stage2);
		}
	}

	/**
	 * この艦隊全体の対空砲火性能を計算
	 * @param {number} [formationId=1]
	 * @param {AntiAirCutIn} [cutIn=null]
	 * @param {boolean} [isAirRaid=false]
	 * @memberof Fleet
	 */
	updateStage2(formationId = 1, cutIn = null, isAirRaid = false) {
		let sumAntiAirBonus = 0;
		for (const ship of this.ships) {
			sumAntiAirBonus += ship.antiAirBonus;
		}

		// 陣形補正
		const formation = FORMATION.find(v => v.id === formationId);
		const formFactor = formation ? formation.correction : 1.0;

		// 変動ボ
		const cutInBonus1 = cutIn ? cutIn.rateCorr : 1.0;
		// 固定ボ
		const cutInBonus2 = cutIn ? cutIn.fixCorr : 0;

		// int(陣形補正 * 艦隊防空値)
		// this.antiAirBonus_kai = Math.floor(formFactor * sumAntiAirBonus) / 1.3;
		// int(陣形補正 * 艦隊防空値) * ブラウザ版補正(2 / 1.3)
		this.antiAirBonus = Math.floor(formFactor * sumAntiAirBonus) * (2 / 1.3);

		// 各艦の固定撃墜数の算出
		for (const ship of this.ships) {
			// 連合艦隊補正
			let unionFactor = 1.0;
			if (this.isUnion && !ship.isEscort) {
				// 空襲補正
				unionFactor = isAirRaid ? 0.72 : 0.8;
			}
			else if (this.isUnion && ship.isEscort) {
				unionFactor = 0.48;
			}

			// 割合撃墜 =>　0.02 * 基本定数(0.25) * 艦船加重対空値 -改式
			// const downRate_ = 0.02 * 0.25 * ship.antiAirWeight_kai * unionFactor;
			// 割合撃墜 =>　艦船加重対空値 * 連合艦隊補正 / 400 -ブラウザ版
			const downRate = ship.antiAirWeight * unionFactor / 400;

			// 最終加重対空値 = (艦船加重対空値 + 艦隊防空補正) * 基本定数(0.25) * 味方相手補正(0.8) -改式
			// const antiAirWeightTotal_ = (ship.antiAirWeight_kai + this.antiAirBonus_kai) * unionFactor * 0.25 * 0.8;
			// 最終加重対空値 = ((艦船加重対空値 + 艦隊防空補正) * 連合艦隊補正 * 対空CI変動ボ) / 10 -ブラウザ版
			const antiAirWeightTotal = (ship.antiAirWeight + this.antiAirBonus) * unionFactor * cutInBonus1 / 10;

			// 固定撃墜
			ship.fixDown = Math.floor(antiAirWeightTotal);
			// 割合撃墜の割合部分
			ship.rateDown = downRate;
			// 最低保証撃墜
			ship.minimumDown = 1 + cutInBonus2;

			// ship.fixDown_kai = Math.floor(antiAirWeightTotal_);
			// ship.rateDown_kai = downRate_;
		}
	}

	/**
	 * 索敵スコアを更新
	 * @memberof Fleet
	 */
	updateScoutScores() {
		this.scoutScores = [];

		// 分岐点係数
		for (let i = 1; i <= 4; i++) {
			const mainFleet = this.ships.filter(v => !v.isEscort);
			const escortFleet = this.ships.filter(v => v.isEscort);
			let block1 = 0;
			let block2 = 0;

			for (const ship of mainFleet) {
				block1 += Math.sqrt(ship.scout + ship.bonusScout);
				block2 += ship.getEquipmentsScout(i);
			}
			const mainScout = block1 + block2 - Math.ceil(this.adminLevel * 0.4) + 2 * (6 - mainFleet.length);

			block1 = 0;
			block2 = 0;
			for (const ship of escortFleet) {
				block1 += Math.sqrt(ship.scout + ship.bonusScout);
				block2 += ship.getEquipmentsScout(i);
			}
			const escortScout = block1 + block2 - Math.ceil(this.adminLevel * 0.4) + 2 * (6 - escortFleet.length);

			const value = this.isUnion ? mainScout + escortScout : mainScout;

			this.scoutScores.push(Math.floor(value * 100) / 100);
		}
	}

	/**
	 * 航空戦ボーナス雷装値を更新
	 * @memberof Fleet
	 */
	updateBonusTorpedo() {
		for (const ship of this.ships) {
			ship.updateAttackerBonus();
		}
	}
}

/**
 * 艦船入力情報クラス
 * @class Ship
 */
class Ship {
	/**
	 *Creates an instance of Ship.
	 * @param {number} shipNo
	 * @memberof Ship
	 */
	constructor(shipNo) {
		/** @type {number} 図鑑id */
		this.id = 0;
		/** @type {number} 艦種 */
		this.type = 0;
		/** @type {number} 艦型 */
		this.type2 = 0;
		/** @type {string} 艦名称 */
		this.name = '';
		/** @type {number} */
		this.shipNo = shipNo;
		/** @type {ShipItem[]} */
		this.items = [];
		/** @type {boolean} */
		this.isEscort = false;
		/** @type {number} */
		this.airPower = 0;
		/** @type {number} */
		this.fullAirPower = 0;
		/** @type {boolean} 搭載がないため無視してもいいフラグ */
		this.ignoreSlot = true;
		/** @type {number} */
		this.level = 99;
		/** @type {number} */
		this.range = 0;
		/** @type {number} */
		this.antiAir = 0;
		/** @type {number} */
		this.antiAirWeight = 0;
		/** @type {number} */
		this.antiAirBonus = 0;
		/** @type {number} */
		this.fixDown = 0;
		/** @type {number} */
		this.rateDown = 0;
		/** @type {number} */
		this.minimumDown = 1;
		/** @type {AntiAirCutIn[]} */
		this.antiAirCutIn = [];
		// /** @type {number} */
		// this.antiAirWeight_kai = 0;
		// /** @type {number} */
		// this.fixDown_kai = 0;
		// /** @type {number} */
		// this.rateDown_kai = 0;
		/** @type {number} */
		this.hunshinRate = 0;
		/** @type {number} */
		this.luck = 0;
		/** @type {number} */
		this.hp = 0;
		/** @type {number} */
		this.armor = 0;
		/** @type {number} */
		this.sumItemArmor = 0;
		/** @type {string} */
		this.drawTabId = '';
		/** @type {number} */
		this.scout = 0;
		/** @type {number} */
		this.bonusScout = 0;
		/** @type {number} 適用ボーナス雷装値 */
		this.bonusTorpedo = 0;
		/** @type {string} 警告文 あれば警告マークがでる */
		this.warningText = ''
	}

	/**
	 * この艦娘の制空値を更新する
	 * @memberof Ship
	 */
	updateAirPower() {
		let sum = 0;
		for (const item of this.items) {
			sum += item.airPower;
		}
		this.airPower = sum;
	}

	/**
	 * 補給状態の制空値を現在の値で置き換える
	 * @memberof Fleet
	 */
	initFullAirPower() {
		this.fullAirPower = this.airPower;
	}

	/**
	 * この艦の現在の装備から装備索敵情報を算出
	 * 副作用として装備ボーナスがある場合は上昇分の更新も行うthis.bonusScout
	 * @param {number} i 分岐点係数
	 * @returns {number} 装備している全ての 装備素索敵 + 改修補正の合算値
	 * @memberof Ship
	 */
	getEquipmentsScout(i) {
		let sumScout = 0;
		for (const item of this.items) {
			const itemScout = (item.scout + Item.getBonusScout(item.type, item.remodel));
			sumScout += itemScout * Item.getItemScoutCoefficient(item.type);
		}
		return sumScout * i
	}

	/**
	 * 装備ボーナス(索敵)の設定
	 * @memberof Ship
	 */
	updateEquipmentBonusScout() {
		this.bonusScout = 0;
		let sumBonus = 0;
		const items = this.items;
		const isAmerica = isUSA(this.type2);
		const isJapanese = isJPN(this.type2);

		// 累積不可
		// SKレーダー
		if (items.some(v => v.id === 278)) {
			// 米艦
			if (isAmerica) sumBonus += 1;
		}
		// SK＋SGレーダー
		if (items.some(v => v.id === 279)) {
			// 米艦
			if (isAmerica) sumBonus += 2;
			// 英艦
			if (isGBR(this.type2)) sumBonus += 1;
		}
		// 21号対空電探
		if (items.some(v => v.id === 30)) {
			// 秋月型か最上改二
			if (this.type2 === 54 || this.id === 301 || this.id === 306) sumBonus += 2;
		}
		// 21号対空電探改二
		if (items.some(v => v.id === 410)) {
			// 秋月型か最上改二
			if (this.type2 === 54 || this.id === 301 || this.id === 306) sumBonus += 2;
		}
		// OS2U
		if (items.some(v => v.id === 171)) {
			// 米戦艦
			if ([8, 9, 10].includes(this.type) && isAmerica) {
				// 最大改修値
				const remodel = getArrayMax(items.filter(v => v.id === 171).map(v => v.remodel));
				if (remodel >= 8) sumBonus += 3;
				else if (remodel >= 3) sumBonus += 2;
				else sumBonus += 1;
			}
		}
		// SOC Seagull
		if (items.some(v => v.id === 414)) {
			// 米艦
			if (isAmerica) {
				// 戦艦
				if ([8, 9, 10].includes(this.type)) sumBonus += 1;
				else {
					const remodel = getArrayMax(items.filter(v => v.id === 414).map(v => v.remodel));
					if (remodel >= 4) sumBonus += 3;
					else sumBonus += 2;
				}
			}
		}
		// Swordfish Mk.II改(水偵型)
		if (items.some(v => v.id === 370)) {
			// Warspite
			if (this.type2 === 67) sumBonus += 3;
			// Gotland級 その他の英艦
			else if (this.type2 === 89 || isGBR(this.type2)) sumBonus += 2;
			// コマちゃん 瑞穂 神威
			else if ([62, 70, 72].includes(this.type2)) sumBonus += 1;
		}
		// Fairey Seafox改
		if (items.some(v => v.id === 371)) {
			// Gotland andra
			if (this.id === 430) sumBonus += 9;
			// Gotland
			else if (this.type2 === 89) sumBonus += 6;
			// Nelson
			else if (this.type2 === 88) sumBonus += 5;
			// コマちゃん
			else if (this.type2 === 70) sumBonus += 4;
			// Warspite Sheffield Richelieu
			else if (this.type2 === 67 || this.type2 === 79 || this.type2 === 108) sumBonus += 3;
		}
		// Swordfish Mk.III改(水上機型)
		if (this.id === 430 && items.some(v => v.id === 368)) {
			// Gotoland andra 1つめだけ
			sumBonus += 1;
		}
		// Swordfish Mk.III改(水上機型/熟練)
		if (this.id === 430 && items.some(v => v.id === 369)) {
			// Gotoland andra 1つめだけ
			sumBonus += 2;
		}
		// 二式艦上偵察機
		if (items.some(v => v.id === 61)) {
			const remodel = getArrayMax(items.filter(v => v.id === 61).map(v => v.remodel));
			// 基本ボーナス
			if (remodel === 10) sumBonus += 3;
			else if (remodel >= 6) sumBonus += 2;
			else if (remodel >= 2) sumBonus += 1;

			// 蒼龍
			if (this.type2 === 17) {
				if (remodel >= 8) sumBonus += 4;
				else if (remodel >= 1) sumBonus += 3;
			}
			// 飛龍
			else if (this.type2 === 25) {
				if (remodel >= 1) sumBonus += 2;
			}
			// 鈴熊 瑞鳳改二乙
			else if ([308, 309, 360].includes(this.id)) {
				if (remodel >= 1) sumBonus += 1;
			}
		}
		// 彩雲
		if (items.some(v => v.id === 54 && v.remodel >= 2)) {
			sumBonus += 1;
		}
		// 彩雲(偵四)
		if (items.some(v => v.id === 273 && v.remodel >= 2)) {
			sumBonus += 1;
		}
		// 試製景雲
		if (items.some(v => v.id === 151 && v.remodel >= 2)) {
			const remodel = getArrayMax(items.filter(v => v.id === 151).map(v => v.remodel));
			// 基本ボーナス
			if (remodel === 10) sumBonus += 3;
			else if (remodel >= 6) sumBonus += 2;
			else if (remodel >= 2) sumBonus += 1;
		}

		// 累積可能装備ボーナス
		for (const item of this.items) {
			// 紫雲
			if (item.id === 118) {
				// 大淀型
				if (this.type2 === 52) {
					if (item.remodel === 10) sumBonus += 3;
					else sumBonus += 2;
				}
			}
			// Late298B
			if (item.id === 194) {
				// Richelieu コマちゃん 瑞穂 神威
				if ([62, 70, 72, 79].includes(this.type2)) sumBonus += 2;
			}
			// Swordfish(水上機型)
			if (item.id === 367) {
				// Gotland コマちゃん 瑞穂 神威
				if ([62, 70, 72, 89].includes(this.type2)) sumBonus += 1;
			}
			// Swordfish Mk.III改(水上機型)
			if (item.id === 368) {
				// Gotoland
				if (this.type2 === 89) sumBonus += 3;
				// コマちゃん 瑞穂 神威
				else if ([62, 70, 72].includes(this.type2)) sumBonus += 2;
			}
			// Swordfish Mk.III改(水上機型/熟練)
			if (item.id === 369) {
				// Gotoland コマちゃん
				if ([70, 89].includes(this.type2)) sumBonus += 3;
				// 瑞穂 神威
				else if ([62, 72].includes(this.type2)) sumBonus += 2;
			}
			// 装甲艇(AB)
			if (item.id === 408) {
				// 神州丸
				if (this.type2 === 97) sumBonus += 2;
				// あきつ丸か駆逐
				else if (this.type2 === 45 || this.type === 2) sumBonus += 1;
			}
			// 熟練見張員
			if (isJapanese && item.id === 129) {
				// 日本軽巡 重巡
				if ([3, 4, 5, 6].includes(this.type)) sumBonus += 3;
				// 日本駆逐
				else if (this.type === 2) sumBonus += 1;
			}
			// 水雷戦隊 熟練見張員
			if (isJapanese && item.id === 412) {
				// 日本軽巡級
				if ([3, 4].includes(this.type)) sumBonus += 3;
				// 日本駆逐 重巡級
				else if ([2, 5, 6].includes(this.type)) sumBonus += 1;
			}
		}

		this.bonusScout = sumBonus;
	}

	/**
	 * 装備されている装備から航空戦雷装値を算出
	 * @memberof Ship
	 */
	updateAttackerBonus() {
		this.warningText = '';
		if (this.ignoreSlot) return;

		const bonus = [];
		for (const item of this.items) {
			if (item.isAttacker) {
				const value = ShipItem.getAttackerBonus(item, this);
				if (value) {
					bonus.push(value);
				}
			}
		}

		// 適用するボーナス 一番ひくいやつ
		this.bonusTorpedo = getArrayMin(bonus);

		// 警告文発生
		if (this.bonusTorpedo < getArrayMax(bonus)) {
			this.warningText = '雷装ボーナス値が低下する艦載機構成です。装備構成の見直しを検討してください。';
		}
	}

	/**
	 * この艦の現在の装備から対空砲火情報を更新
	 * @memberof Ship
	 */
	updateAntiAirStatus() {
		let sumWeight = 0;
		// let sumWeight_kai = 0;
		let sumBonus = 0;

		for (const item of this.items) {
			sumWeight += item.antiAirWeight;
			// sumWeight_kai += item.antiAirWeight_kai;

			sumBonus += item.antiAirBonus;
		}

		// 加重対空値 -改式
		// this.antiAirWeight_kai = sumWeight_kai + this.antiAir / 2;

		// 加重対空値 -ブラウザ
		if (this.items.length > 0) {
			// not 素手
			this.antiAirWeight = 2 * Math.floor((this.antiAir + sumWeight) / 2);
		}
		else {
			// 素手
			this.antiAirWeight = Math.floor(this.antiAir + sumWeight);
		}

		// 艦隊防空ボーナス
		this.antiAirBonus = Math.floor(sumBonus);

		// 利用可能対空CIの設定
		this.setAntiAirCutIn();

		// 噴進弾幕のやつ
		this.setHunshinRate();
	}

	/**
	 * 発動可能対空CIと発動率など
	 * @memberof Ship
	 */
	setAntiAirCutIn() {
		// 発動できる種別群　pushした順番は厳守！！！
		const cutin = [];
		// 艦娘id
		const shipId = this.id;
		// 装備一覧
		const items = this.items;
		// 特殊高角砲の数 (対空値8以上)
		const tkCount = items.filter(v => v.itype === 16 && v.antiAir > 7).length;
		// 通常高角砲の数 (対空値7以下)
		const kCount = items.filter(v => v.itype === 16 && v.antiAir <= 7).length;
		// 対空電探の数 (対空値1以上)
		const arCount = items.filter(v => v.itype === 11 && v.antiAir > 0).length;
		// 電探の数 (対空値関係なし)
		const rCount = items.filter(v => v.itype === 11).length;
		// 特殊機銃の数 (対空値9以上)
		const tkjCount = items.filter(v => v.type === 21 && v.antiAir > 8).length;
		// 普通の機銃の数 (対空値8以下)
		const kjCount = items.filter(v => v.type === 21 && v.antiAir <= 8).length;
		// 高角砲の有無
		const hasKoukaku = (tkCount + kCount) > 0;
		// 高射装置の有無
		const hasKousha = hasTypeItem(items, 36);
		// GFCS Mk.37の有無
		const hasGFCS = items.some(v => v.id === 307);

		// 秋月型
		if (this.type2 === 54 && hasKoukaku) {
			// 1種 (高角砲2, 電探)
			if ((tkCount + kCount) >= 2 && rCount > 0) cutin.push(1);
			// 2種 (高角砲, 電探) 共存なし
			else if (hasKoukaku && rCount > 0) cutin.push(2);
			// 3種 (高角砲2) 共存なし
			else if ((tkCount + kCount) >= 2) cutin.push(3);
		}
		else {
			// Atlanta
			if (shipId === 397 || shipId === 1496) {
				// GFCS Mk.37+5inch連装両用砲(集中配備) × 2
				if (items.filter(v => v.id === 363).length >= 2) {
					// 38種
					cutin.push(38);
					if (hasGFCS) cutin.push(40);
					cutin.push(41);
				}
				// GFCS Mk.37+5inch連装両用砲(集中配備), 5inch連装両用砲(集中配備)
				if (items.some(v => v.id === 363) && items.some(v => v.id === 362)) {
					// 39種
					cutin.push(39);
					// 40種 (GFCS Mk.37)
					if (hasGFCS && !cutin.includes(40)) cutin.push(40);
					// 41種
					if (!cutin.includes(41)) cutin.push(41);
				}
				// 5inch連装両用砲(集中配備) * 2
				if (items.filter(v => v.id === 362).length >= 2) {
					// 40種 (GFCS Mk.37)
					if (hasGFCS && !cutin.includes(40)) cutin.push(40);
					// 41種
					if (!cutin.includes(41)) cutin.push(41);
				}
			}
			// Fletcher級
			else if ([362, 396, 428, 429, 1489, 1492].includes(shipId)) {
				// 34種 (5inch単装砲 Mk.30改+GFCS Mk.37, 5inch単装砲 Mk.30改+GFCS Mk.37)
				if (items.filter(v => v.id === 308).length >= 2) cutin.push(34);
				// 35種 (5inch単装砲 Mk.30改+GFCS Mk.37, 5inch単装砲 Mk.30 / 改)
				if (items.some(v => v.id === 308) && items.some(v => v.id === 284 || v.id === 313)) cutin.push(35);
				// 36種 (5inch単装砲 Mk.30 / 改 2種, GFCS Mk.37)
				if (items.filter(v => v.id === 284 || v.id === 313).length >= 2 && hasGFCS) cutin.push(36);
				// 37種 (5inch単装砲 Mk.30改 2種)
				if (items.filter(v => v.id === 313).length >= 2) cutin.push(37);
			}
			// 摩耶様改二
			else if (shipId === 228) {
				// 10種 (高角砲, 特殊機銃, 対空電探)
				if (hasKoukaku && tkjCount > 0 && arCount > 0) cutin.push(10);
				// 11種 (高角砲, 特殊機銃)
				if (hasKoukaku && tkjCount > 0) cutin.push(11);
			}
			// 五十鈴改二
			else if (shipId === 141) {
				// 14種 (高角砲, 対空機銃, 対空電探)
				if (hasKoukaku && (kjCount > 0 || tkjCount > 0) && arCount > 0) cutin.push(14);
				// 15種 (高角砲, 対空機銃)
				if (hasKoukaku && (kjCount > 0 || tkjCount > 0)) cutin.push(15);
			}
			// 霞改二乙 夕張改二
			else if (shipId === 270 || shipId === 422) {
				// 16種 (高角砲, 対空機銃, 対空電探)
				if (hasKoukaku && (kjCount > 0 || tkjCount > 0) && arCount > 0) cutin.push(16);
				// 17種 (高角砲, 対空機銃)
				if (hasKoukaku && (kjCount > 0 || tkjCount > 0)) cutin.push(17);
			}
			// 鬼怒改二
			else if (shipId === 287) {
				// 19種 (よわ高角砲, 特殊機銃)
				if (kCount > 0 && tkjCount > 0) cutin.push(19);
			}
			// 由良改二
			else if (shipId === 288) {
				// 21種 (高角砲, 対空電探)
				if (hasKoukaku && arCount > 0) cutin.push(21);
			}
			// 伊勢型改 / 改二
			else if ([102, 103, 353, 354].includes(shipId)) {
				// 25種 (噴進砲改二, 対空電探, 三式弾)
				if (arCount > 0 && hasTypeItem(items, 18) && items.some(v => v.id === 274)) cutin.push(25);
			}

			// 汎用
			// 全ての水上艦 => 判定できないが必須装備が潜水艦を弾ける
			// 戦艦 航空戦艦 => 判定できないが大口径主砲を積めるのが戦艦だけ

			// 4種 (大口径, 三式弾, 高射装置, 対空電探)
			if (hasTypeItem(items, 3) && hasTypeItem(items, 18) && hasKousha && arCount > 0) cutin.push(4);
			// 5種 (特殊高角砲2, 対空電探)
			if (tkCount >= 2 && arCount > 0) cutin.push(5);
			// 6種 (大口径, 三式弾, 高射装置)
			if (hasTypeItem(items, 3) && hasTypeItem(items, 18) && hasKousha) cutin.push(6);
			// 8種 (特殊高角砲, 対空電探)
			if (tkCount >= 1 && arCount > 0) cutin.push(8);
			// 7種 (高角砲, 高射装置, 対空電探)
			if (hasKoukaku && hasKousha && arCount > 0) cutin.push(7);

			// 武蔵改 / 改二
			if (shipId === 148 || shipId === 346) {
				// 26種 (武蔵改二, 10cm改+増設, 対空電探)
				if (shipId === 346 && arCount > 0 && items.some(v => v.id === 275)) cutin.push(26);
				// 28種 (噴進砲改二, 対空電探)
				if (arCount > 0 && items.some(v => v.id === 274)) cutin.push(28);
			}
			// 伊勢型改 / 改二
			else if ([102, 103, 353, 354].includes(shipId)) {
				// 28種 (噴進砲改二, 対空電探)
				if (arCount > 0 && items.some(v => v.id === 274)) cutin.push(28);
			}
			// 磯風乙改 / 浜風乙改
			else if (shipId === 357 || shipId === 358) {
				// 29種 (高角砲, 対空電探)
				if (hasKoukaku && arCount > 0) cutin.push(29);
			}

			// 9種 (高角砲, 高射装置)
			if (hasKoukaku && hasKousha) cutin.push(9);

			// Gotland改以降
			if (shipId === 379 || shipId === 430) {
				// 33種 (高角砲, 通常機銃)
				if (hasKoukaku && kjCount > 0) cutin.push(33);
			}

			// 12種 (特殊機銃, 素対空値3以上の機銃, 対空電探)
			if (tkjCount > 0 && items.filter(v => v.type === 21 && v.antiAir >= 3).length >= 2 && arCount > 0) cutin.push(12);

			// 皐月改二
			if (shipId === 218) {
				// 18種 (特殊機銃)
				if (tkjCount > 0) cutin.push(18);
			}
			// 鬼怒改二
			else if (shipId === 287) {
				// 20種 (特殊機銃)
				if (tkjCount > 0) cutin.push(20);
			}
			// 文月改二
			else if (shipId === 348) {
				// 22種 (特殊機銃)
				if (tkjCount > 0) cutin.push(22);
			}
			// UIT-25 伊504
			else if (shipId === 329 || shipId === 330) {
				// 23種 (通常機銃)
				if (kjCount > 0) cutin.push(23);
			}
			// 龍田改二
			else if (shipId === 278) {
				// 24種 (高角砲, 通常機銃)
				if (kCount > 0 && kjCount > 0) cutin.push(24);
			}
			// 天龍改二
			else if (shipId === 277) {
				// 24種 (高角砲, 通常機銃)
				if (kCount > 0 && kjCount > 0) cutin.push(24);
				// 30種 (高角砲3)
				if ((tkCount + kCount) >= 3) cutin.push(30);
				// 31種 (高角砲2)
				if ((tkCount + kCount) >= 2) cutin.push(31);
			}
			// Gotland改以降
			else if (shipId === 379 || shipId === 430) {
				// 30種 (高角砲3)
				if ((tkCount + kCount) >= 3) cutin.push(30);
			}
			// 英国艦艇 / 金剛型改二
			else if (isGBR(this.type2) || [149, 150, 151, 152, 391, 392].includes(this.id)) {
				// 32種 (16inch Mk.I三連装砲改+FCR type284, QF 2ポンド8連装ポンポン砲)
				if (items.some(v => v.id === 300) && items.some(v => v.id === 191)) cutin.push(32);
				// 32種 (20連装7inch UP Rocket Launchers, QF 2ポンド8連装ポンポン砲)
				else if (items.some(v => v.id === 301) && items.some(v => v.id === 191)) cutin.push(32);
				// 32種 (20連装7inch UP Rocket Launchers, 20連装7inch UP Rocket Launchers)
				else if (items.filter(v => v.id === 301).length >= 2) cutin.push(32);
			}
		}

		// マスタより、対空CIオブジェクトを格納
		// 優先度順により、先に格納された対空CIの発生率より低いものは、格納すらしない
		let maxRate = 0;
		for (const id of cutin) {
			const raw = ANTIAIR_CUTIN.find(v => v.id === id);
			if (!raw) continue;

			const aac = new AntiAirCutIn();
			aac.id = raw.id;
			aac.rateCorr = raw.adj[0];
			aac.fixCorr = raw.adj[1];
			const rate = raw.rate / 101;

			if (raw.id >= 34) {
				// 34種以降は個別の発動率をそのまま加算
				aac.rate = rate;
			}
			else if (maxRate < rate) {
				// 既に発動可能な対空CIより発動率が高いなら格納OK ただし先に判定に入っている種別分確率を差っ引く
				aac.rate = rate - maxRate;
				maxRate = rate;
			}

			// 格納
			if (aac.rate) {
				// 最低発動率更新　以降の34種未満の対空CIで、これ以下の発動率のものは発動しない(=格納しない)
				this.antiAirCutIn.push(aac);
			}
		}
	}

	/**
	 * この艦の熟練度クリティカルボーナスを返却
	 * @returns
	 * @memberof Ship
	 */
	getProfCriticalBonus() {
		let bonus = 0;
		for (const item of this.items) {
			// 対象は搭載数が存在する攻撃機か大型飛行艇
			if (item.slot > 0 && (item.isAttacker || item.type === 41)) {
				// 内部熟練度
				const innerLevel = getInnerProficiency(item.level, item.type);
				// 熟練度定数C
				const c = [0, 1, 2, 3, 4, 5, 7, 10][item.level];
				// 隊長機補正
				const div = item.slotNo === 0 ? 100 : 200;
				bonus += Math.floor(Math.sqrt(innerLevel) + c) / div;
			}
		}

		// 補正値 = int(√内部熟練度  + C) / (100 or 200)
		return 1 + bonus;
	}

	/**
	 * 噴進弾幕発動率を設定
	 * @memberof Ship
	 */
	setHunshinRate() {
		// 噴進砲改二チェック
		const hunshinCount = this.items.filter(v => v.id === 274).length
		if (hunshinCount) {
			this.hunshinRate = (0.9 * Math.min(this.luck, 50) + this.antiAirWeight) / 281;

			// 複数積みボーナス
			if (hunshinCount === 2) {
				this.hunshinRate += 0.15;
			}
			else if (hunshinCount === 3) {
				this.hunshinRate += 0.3;
			}

			// 伊勢型ボーナス
			if ([102, 103, 353, 354].includes(this.id)) {
				this.hunshinRate += 0.25;
			}
		}
	}
}

/**
 * 対空CIクラス
 * @class AntiAirCutIn
 */
class AntiAirCutIn {
	constructor() {
		/** @type {number} */
		this.id = 0;
		/** @type {number} */
		this.fixCorr = 0;
		/** @type {number} */
		this.rateCorr = 1.0;
		/** @type {number} */
		this.rate = 0;
	}
}

/**
 * stage2 撃墜テーブル
 * @class FleetStage2
 */
class FleetStage2 {
	constructor() {
		/** @type {AntiAirCutIn} */
		this.cutin = null;
		/** @type {number} */
		this.rate = 0;
		/** @type {number} */
		this.border = 0;
		/** @type {ShootDownStatus[]} */
		this.table = [];
	}
}

/**
 * 撃墜性能クラス(割合撃墜 固定撃墜 最低保証)
 * @class ShootDownStatus
 */
class ShootDownStatus {
	constructor() {
		/** @type {number} */
		this.rateDown = 0;
		/** @type {number} */
		this.fixDown = 0;
		/** @type {number} */
		this.minimumDown = 0;
	}
}

/**
 * 基地航空隊全体
 * @class LandBaseAll
 */
class LandBaseAll {
	constructor() {
		/** @type {LandBase[]} */
		this.landBases = [];
		/** @type {number} */
		this.defenseAirPower = 0;
		/** @type {number} */
		this.defense2AirPower = 0;
		/** @type {number} */
		this.rocketBonus = 0;
	}

	/**
	 * 防空時制空値を取得
	 * ロケ戦も考慮
	 * @memberof LandBaseAll
	 */
	updateDefenseAirPower() {
		// ロケット戦闘機の数を取得
		let rocketCount = 0;
		let sumAp = 0;
		for (const v of this.landBases) {
			// 防空札になってないのはノーカン
			if (v.mode !== 0) continue;
			sumAp += v.defenseAirPower;
			for (const plane of v.planes) if (ROCKETS.includes(plane.id)) rocketCount += 1;
		}

		// 対重爆時補正 ロケット0機:0.5、1機:0.8、2機:1.1、3機異常:1.2
		this.rocketBonus = rocketCount === 0 ? 0.5 : rocketCount === 1 ? 0.8 : rocketCount === 2 ? 1.1 : 1.2;
		this.defenseAirPower = sumAp;
		this.defense2AirPower = Math.floor(this.rocketBonus * sumAp);
	}

	/**
	 * 結果保持用オブジェクトの初期化
	 * @memberof LandBaseAll
	 */
	clearResult() {
		for (const lb of this.landBases) {
			lb.results = [];
			for (let index = 0; index < battleCount; index++) {
				lb.results.push(new AirStatusResult());
			}
		}
	}
}

/**
 * 基地航空隊部隊別
 * @class LandBase
 */
class LandBase {
	constructor(baseNo, mode) {
		/** @type {number} */
		this.baseNo = baseNo;
		/** @type {LandBaseItem[]} */
		this.planes = [];
		/** @type {number} */
		this.mode = mode;
		/** @type {number[]} */
		this.target = [-1, -1];
		/** @type {number} */
		this.airPower = 0;
		/** @type {number} */
		this.fullAirPower = 0;
		/** @type {number} */
		this.defenseAirPower = 0;
		/** @type {number} */
		this.reconCorr = 0;
		/** @type {number} */
		this.defenseCorr = 1.0;
		/** @type {AirStatusResult[]} */
		this.results = [];
		/** @type {boolean} */
		this.hasJet = false;
		/** @type {boolean} 分散ならtrue */
		this.isSeparate = false;

		for (let index = 0; index < battleCount; index++) {
			this.results.push(new AirStatusResult());
		}
	}

	/**
	 * この航空隊の制空値、補正値を設定する
	 * @memberof LandBase
	 */
	updateAirPower() {
		let sum = 0;
		for (const plane of this.planes) {
			sum += plane.airPower;
		}

		const baseAP = sum;
		let resultAP = baseAP;

		if (this.reconCorr < 1.0) {
			// 最低保証
			this.reconCorr = 1.0;

			// 偵察機たち
			const planes = this.planes.filter(v => v.isRecon);

			// 補正後の値が上回っているものに更新
			for (const plane of planes) {
				const corr = getReconnaissancesAdjust(plane, false);
				const newAp = baseAP * corr;
				if (newAp > resultAP) {
					resultAP = newAp;
					this.reconCorr = corr;
				}
			}
		}
		else {
			// 補正値が設定されていたらそれを使う
			resultAP = baseAP * this.reconCorr;
		}

		this.airPower = Math.floor(resultAP);
	}

	/**
	 * この航空隊の防空時の制空値、補正値を設定する
	 * @memberof LandBase
	 */
	updateDefenseAirPower() {
		const baseAP = getArraySum(this.planes.map(v => v.defenseAirPower));
		let resultAP = baseAP;
		// 偵察機たち
		const planes = this.planes.filter(v => v.isRecon);

		// 補正後の値が上回っているものに更新
		for (const plane of planes) {
			const corr = getReconnaissancesAdjust(plane, true);
			const newAp = baseAP * corr;
			if (newAp > resultAP) {
				resultAP = newAp;
				this.reconCorr = corr;
			}
		}

		this.defenseAirPower = Math.floor(resultAP);
	}

	/**
	 * 行動半径を返却
	 * @readonly
	 * @memberof LandBase
	 */
	getRange() {
		let minRange = 999;
		let maxLos = 1;
		for (const plane of this.planes) {

			if (!plane.id) {
				continue;
			}

			// 最も短い半径
			minRange = plane.radius < minRange ? plane.radius : minRange;

			// 偵察機の中でで最も長い半径を取得
			if (plane.isRecon) {
				maxLos = maxLos < plane.radius ? plane.radius : maxLos;
			}
		}

		if (maxLos < 999 && maxLos > minRange) return Math.round(minRange + Math.min(Math.sqrt(maxLos - minRange), 3));
		else return minRange === 999 ? 0 : minRange;
	}

	/**
	 * 現航空隊の出撃時燃料消費を返却
	 * @readonly
	 * @memberof LandBase
	 */
	getSumFuel() {
		return getArraySum(this.planes.map(v => v.fuel));
	}

	/**
	 * 現航空隊の出撃時弾薬消費を返却
	 * @readonly
	 * @memberof LandBase
	 */
	getSumAmmo() {
		return getArraySum(this.planes.map(v => v.ammo));
	}

	/**
	 * 現航空隊の配備時ボーキを返却
	 * @readonly
	 * @memberof LandBase
	 */
	getSumBauxite() {
		return getArraySum(this.planes.map(v => v.bauxite));
	}

	/**
	 * 現航空隊の噴式発生時コストを返却
	 * @readonly
	 * @memberof LandBase
	 */
	getSumSteel() {
		return getArraySum(this.planes.map(v => v.steel));
	}
}

/**
 * 通常装備クラス
 * @class
 */
class Item {
	/**
	 *Creates an instance of Item.
	 * @param {number} id
	 * @param {number} [slot=0]
	 * @param {number} [remodel=0]
	 * @param {number} [level=0]
	 * @memberof Item
	 */
	constructor(id, slot = 0, remodel = 0, level = 0) {
		/** @type {number} */
		this.id = 0;
		/** @type {string} */
		this.name = '-';
		/** @type {number} */
		this.type = 0;
		/** @type {number} */
		this.itype = 0;
		/** @type {number} */
		this.antiAir = 0;
		/** @type {number} */
		this.bonusAntiAir = 0;
		/** @type {number} */
		this.actualAntiAir = 0;
		/** @type {number} */
		this.antiBomber = 0;
		/** @type {number} */
		this.interception = 0;
		/** @type {number} */
		this.scout = 0;
		/** @type {number} */
		this.airPower = 0;
		/** @type {number} */
		this.fullAirPower = 0;
		/** @type {number} */
		this.radius = 0;
		/** @type {number} */
		this.cost = 0;
		/** @type {number} */
		this.accuracy = 0;
		/** @type {number} */
		this.avoid = 0;
		/** @type {number} */
		this.range = 0;
		/** @type {number} */
		this.fire = 0;
		/** @type {number} */
		this.torpedo = 0;
		/** @type {number} */
		this.bomber = 0;
		/** @type {number} */
		this.asw = 0;
		/** @type {number} */
		this.armor = 0;
		/** @type {boolean} */
		this.isFighter = false;
		/** @type {boolean} */
		this.isRecon = false;
		/** @type {boolean} */
		this.isAttacker = false;
		/** @type {boolean} */
		this.canBattle = false;
		/** @type {boolean} */
		this.isPlane = false;
		/** @type {boolean} */
		this.isJet = false;
		/** @type {boolean} */
		this.isExpanded = false;
		/** @type {number} */
		this.contact = 0;
		/** @type {number[]} */
		this.selectRate = [];
		/** @type {number} */
		this.fullSlot = 0;
		/** @type {number} */
		this.slot = slot;
		/** @type {number} */
		this.remodel = 0;
		/** @type {number} */
		this.level = 0;
		/** @type {number} */
		this.fuel = 0;
		/** @type {number} */
		this.ammo = 0;
		/** @type {number} */
		this.bauxite = 0;
		/** @type {number} */
		this.steel = 0;
		/** @type {number} */
		this.bonusAirPower = 0;
		/** @type {number} */
		this.slotNo = 0;

		const raw = ITEM_DATA.find(v => v.id === id);
		if (raw) {
			// 基本ステータス
			this.id = raw.id;
			this.name = raw.name;
			this.type = raw.type;
			this.itype = raw.itype;
			this.antiAir = raw.antiAir;
			this.antiBomber = raw.antiBomber;
			this.interception = raw.interception;
			this.scout = raw.scout;
			this.radius = raw.radius;
			this.cost = raw.cost;
			this.accuracy = raw.accuracy;
			this.avoid = raw.avoid;
			this.range = raw.range2;
			this.fire = raw.fire;
			this.torpedo = raw.torpedo;
			this.bomber = raw.bomber;
			this.asw = raw.asw;
			this.armor = raw.armor;
			this.isFighter = FIGHTERS.includes(raw.type);
			this.isAttacker = ATTACKERS.includes(raw.type);
			this.isRecon = RECONNAISSANCES.includes(raw.type);
			this.isJet = raw.type === 57;
			this.canBattle = this.isFighter || this.isAttacker;
			this.isPlane = this.canBattle || this.isRecon;
			this.remodel = remodel;
			this.level = level;

			// 以下、機体のみ
			if (this.isPlane) {
				// スロット数審査 & 格納
				this.validateSlot(slot);

				// スロット数によって変動しない制空値ボーナス計算
				this.calcBonusAirPower();

				// 改修値による対空値ボーナスの計算
				this.bonusAntiAir = Item.getBonusAntiAir(this.id, this.type, this.remodel, this.antiAir);
				this.antiAir += this.bonusAntiAir;

				// 制空計算用対空値の更新
				if (this.isFighter) {
					this.actualAntiAir = (this.antiAir + 1.5 * this.interception);
				}
				else {
					this.actualAntiAir = this.antiAir;
				}

				// 制空値算出
				this.updateAirPower();

				// 触接関連
				if (this.slot > 0) {
					// 触接開始因数
					this.contact = this.isRecon ? Math.floor(this.scout * Math.sqrt(this.slot)) : 0;
					// 触接選択率
					this.selectRate = getContactSelectRate(this);
				}

				// 出撃コスト加算
				const isLbAtaccker = LB_ATTACKERS.includes(this.type);
				this.fuel = Math.ceil(this.slot * (isLbAtaccker ? 1.5 : this.type === 53 ? 2.0 : 1.0));
				this.ammo = isLbAtaccker ? Math.floor(this.slot * 0.7) : this.type === 53 ? this.slot * 2 : Math.ceil(this.slot * 0.6);
				if (this.type === 41) {
					this.fuel = this.slot * 3;
					this.ammo = this.slot;
				}
				this.bauxite = this.cost * (this.isRecon ? 4 : this.type === 53 ? 9 : 18);
				this.steel = this.isJet ? Math.round(this.slot * this.cost * 0.2) : 0;

				// 補給時制空値
				this.fullAirPower = this.airPower;
			}
		}
	}

	/**
	 * 現在の搭載数から制空値を算出、更新する
	 * @memberof Item
	 */
	updateAirPower() {
		if (this.isRecon || this.slot <= 0 || this.id === 0) {
			this.airPower = 0;
			if (this.slot < 0) {
				this.slot = 0;
			}
		}
		else {
			// 基本制空値 + ボーナス制空値
			this.airPower = Math.floor(this.antiAir * Math.sqrt(this.slot) + this.bonusAirPower);
		}
	}

	/**
	 * 搭載数によって変動しないボーナスの制空値
	 * @returns {number}
	 * @memberof Item
	 */
	calcBonusAirPower() {
		if (this.id === 0 || this.slot === 0) return 0;
		const type = this.type;
		const level = this.level;
		let sumPower = 0.0;

		// 艦戦 夜戦 水戦
		if (this.isFighter) {
			switch (level) {
				case 7:
					sumPower += 22;
					break;
				case 2:
					sumPower += 2;
					break;
				case 3:
					sumPower += 5;
					break;
				case 4:
					sumPower += 9;
					break;
				case 5:
					sumPower += 14;
					break;
				case 6:
					sumPower += 14;
					break;
				default:
					break;
			}
		}
		// 水爆
		else if (type === 11) {
			switch (level) {
				case 2:
					sumPower += 1;
					break;
				case 3:
					sumPower += 1;
					break;
				case 4:
					sumPower += 1;
					break;
				case 5:
					sumPower += 3;
					break;
				case 6:
					sumPower += 3;
					break;
				case 7:
					sumPower += 6;
					break;
				default:
					break;
			}
		}

		// 内部熟練度ボーナス
		sumPower += Math.sqrt(getInnerProficiency(level, type) / 10);

		if (type === 49) {
			// 陸偵 搭載4★2以上で制空値+1
			sumPower += (this.remodel >= 2 && this.slot === 4 ? 1 : 0);
		}
		else if (this.id === 138) {
			// 二式大艇 搭載4★4で制空+1
			sumPower += (this.remodel >= 4 && this.slot === 4 ? 1 : 0);
		}

		this.bonusAirPower = sumPower;
	}

	/**
	 * 艦載機カテゴリ、改修値からボーナス対空値を返却
	 * @static
	 * @param {number} id 機体id
	 * @param {number} type カテゴリコード
	 * @param {number} remodel 改修値
	 * @param {number} prevAntiAir 素の対空値
	 * @returns {number} ボーナス対空値
	 * @memberof Item
	 */
	static getBonusAntiAir(id, type, remodel, prevAntiAir) {
		let aa = 0;
		// 艦戦 夜戦 水戦
		if (FIGHTERS.includes(type)) {
			aa = 0.2 * remodel;
		}
		// 艦爆 (FM-2とRe.2001 CB改は除外)
		else if (type === 7 && prevAntiAir > 2 && id !== 277 && id !== 316) {
			aa = 0.25 * remodel;
		}
		// 陸攻
		else if (LB_ATTACKERS.includes(type)) {
			aa = 0.5 * Math.sqrt(remodel);
		}
		return aa;
	}

	/**
	 * カテゴリ、改修値からボーナス火力を返却
	 * @static
	 * @param {number} type カテゴリコード
	 * @param {number} remodel 改修値
	 * @returns {number} ボーナス
	 * @memberof Item
	 */
	static getBonusFire(type, remodel) {
		let bonus = 0;

		// 大口径主砲
		if (type === 3) {
			bonus = 1.5 * Math.sqrt(remodel);
		}
		// 主砲 / 副砲 / 徹甲弾 / 機銃 / 探照灯 / 高射装置 / 大発
		else if ([1, 2, 4, 19, 21, 24, 29, 36, 42].includes(type)) {
			bonus = Math.sqrt(remodel);
		}
		// ソナー 爆雷
		else if ([14, 15].includes(type)) {
			bonus = 0.75 * Math.sqrt(remodel);
		}
		return bonus;
	}

	/**
	 * カテゴリ、改修値からボーナス雷装値を返却
	 * @static
	 * @param {number} type カテゴリコード
	 * @param {number} remodel 改修値
	 * @returns {number} ボーナス雷装値
	 * @memberof Item
	 */
	static getBonusTorpedo(type, remodel) {
		let bonus = 0;
		// 艦攻
		if (type === 8) {
			bonus = 0.2 * remodel;
		}
		// 陸攻 重爆
		else if (LB_ATTACKERS.includes(type)) {
			bonus = 0.7 * Math.sqrt(remodel);
		}
		// 魚雷 / 機銃
		else if (type === 5 || type === 21) {
			bonus = 1.2 * Math.sqrt(remodel);
		}
		return bonus;
	}

	/**
	 * カテゴリ、改修値からボーナス爆装値を返却
	 * @static
	 * @param {number} id id
	 * @param {number} type カテゴリコード
	 * @param {number} remodel 改修値
	 * @returns {number} ボーナス爆装値
	 * @memberof Item
	 */
	static getBonusBomber(id, type, remodel) {
		let bonus = 0;
		// 艦爆 (爆戦以外)
		if (type === 7 && id !== 60 && id !== 154 && id !== 219 && id !== 447) {
			bonus = 0.2 * remodel;
		}
		// 水爆
		else if (type === 11) {
			bonus = 0.2 * remodel;
		}
		return bonus;
	}

	/**
	 * カテゴリ、改修値からボーナス命中を返却
	 * @static
	 * @param {number} id 装備id
	 * @param {number} type カテゴリコード
	 * @param {number} remodel 改修値
	 * @returns {number} ボーナス
	 * @memberof Item
	 */
	static getBonusAccuracy(id, type, remodel) {
		let bonus = 0;
		// 一部電探 電探改修可能変更時注意
		if ([28, 29, 31, 32, 88, 89, 141, 240, 278, 279, 307, 315].includes(id)) {
			bonus = 1.7 * Math.sqrt(remodel);
		}
		// 主砲 副砲 徹甲弾 高射装置 探照灯
		else if ([1, 2, 3, 4, 12, 13, 19, 29, 36, 42].includes(type)) {
			bonus = Math.sqrt(remodel);
		}
		return bonus;
	}

	/**
	 * カテゴリ、改修値からボーナス対潜を返却
	 * @static
	 * @param {number} id 機体id
	 * @param {number} type カテゴリコード
	 * @param {number} remodel 改修値
	 * @param {number} prevAntiAir 素の対空値
	 * @returns {number} ボーナス
	 * @memberof Item
	 */
	static getBonusASW(id, type, remodel, prevAntiAir) {
		let bonus = 0;
		// ソナー 爆雷
		if ([14, 15].includes(type)) {
			bonus = Math.sqrt(remodel);
		}
		// 艦攻
		else if (type === 8) {
			bonus = 0.2 * remodel;
		}
		// 艦爆 対空2以下
		else if (type === 7 && (prevAntiAir <= 2 || id === 277 || id === 316)) {
			bonus = 0.2 * remodel;
		}
		return bonus;
	}

	/**
	 * カテゴリ、改修値からボーナス索敵を返却
	 * @static
	 * @param {number} type カテゴリコード
	 * @param {number} remodel 改修値
	 * @returns {number} ボーナス
	 * @memberof Item
	 */
	static getBonusScout(type, remodel) {
		let bonus = 0;
		// 小型電探
		if (type === 12) {
			bonus = 1.25 * Math.sqrt(remodel);
		}
		// 大型電探
		else if (type === 13) {
			bonus = 1.4 * Math.sqrt(remodel);
		}
		// 偵察機
		else if ([9, 10, 41].includes(type)) {
			bonus = 1.2 * Math.sqrt(remodel);
		}
		// 水上爆撃機
		else if (type === 11) {
			bonus = 1.15 * Math.sqrt(remodel);
		}
		return bonus;
	}

	/**
	 * 索敵装備係数
	 * @static
	 * @param {number} type カテゴリコード
	 * @returns {number} 装備係数
	 * @memberof Item
	 */
	static getItemScoutCoefficient(type) {
		let value = 0.6;
		if (type === 8) {
			// 艦上攻撃機
			value = 0.8;
		}
		else if (type === 9) {
			// 艦上偵察機
			value = 1.0;
		}
		else if (type === 10) {
			// 水上偵察機
			value = 1.2;
		}
		else if (type === 11) {
			// 水上爆撃機
			value = 1.1;
		}

		return value;
	}

	/**
	 * 艦載機カテゴリ、改修値からこの装備の加重対空値を返却
	 * @static
	 * @param {number} type カテゴリコード
	 * @param {number} itype カテゴリサブコード
	 * @param {number} remodel 改修値
	 * @param {number} antiAir 素の対空値
	 * @returns {number} 加重対空値
	 * @memberof Item
	 */
	static getAntiAirWeight(type, itype, remodel, antiAir) {
		let antiAirWeight = 0;

		// 加重対空値部品 => 装備対空値 * 装備倍率(ブラウザ版採用[2倍])
		if (itype === 16 || type === 36) {
			// 高角砲 or 高射装置
			antiAirWeight = antiAir * 4;
			// antiAirWeight_kai = antiAir * 2;
		}
		else if (itype === 11) {
			// 電探
			antiAirWeight = antiAir * 3;
			// antiAirWeight_kai = antiAir * 1.5;
		}
		else if (type === 21) {
			// 機銃
			antiAirWeight = antiAir * 6;
			// antiAirWeight_kai = antiAir * 3;
		}

		// 艦船対空改修補正 = 装備倍率(ブラウザ版採用[2倍]) * √★
		if (antiAir <= 7 && (itype === 16 || type === 36)) {
			// 対空値7以下の高角砲 高射装置
			antiAirWeight += 2 * Math.sqrt(remodel);
			// antiAirWeight_kai += 1 * Math.sqrt(remodel);
		}
		else if (antiAir > 7 && (itype === 16 || type === 36)) {
			// 対空値8以上の高角砲 高射装置
			antiAirWeight += 3 * Math.sqrt(remodel);
			// antiAirWeight_kai += 1.5 * Math.sqrt(remodel);
		}
		else if (antiAir <= 7 && type === 21) {
			// 対空値7以下の機銃
			antiAirWeight += 4 * Math.sqrt(remodel);
			// antiAirWeight_kai += 2 * Math.sqrt(remodel);
		}
		else if (antiAir > 7 && type === 21) {
			// 対空値8以上の機銃
			antiAirWeight += 6 * Math.sqrt(remodel);
			// antiAirWeight_kai += 3 * Math.sqrt(remodel);
		}

		return antiAirWeight;
	}

	/**
	 * 艦載機カテゴリ、改修値からこの装備の加重対空値を返却
	 * @static
	 * @param {number} id 装備id
	 * @param {number} type カテゴリコード
	 * @param {number} itype カテゴリサブコード
	 * @param {number} remodel 改修値
	 * @param {number} antiAir 素の対空値
	 * @returns {number} 加重対空値
	 * @memberof Item
	 */
	static getAntiAirBonus(id, type, itype, remodel, antiAir) {
		let antiAirBonus = 0;

		// 艦隊防空ボーナス
		if (itype === 16 || type === 36) {
			// 高角砲
			antiAirBonus = antiAir * 0.35;
		}
		else if (itype === 11) {
			// 電探
			antiAirBonus = antiAir * 0.4;
		}
		else if (type === 18) {
			// 対空強化弾
			antiAirBonus = antiAir * 0.6;
		}
		else if (id === 9) {
			// 46cm三連装砲
			antiAirBonus = antiAir * 0.25;
		}
		else {
			// その他
			antiAirBonus = antiAir * 0.2;
		}

		// 艦隊防空装備改修補正 = 装備倍率 * √★
		if (antiAir <= 7 && (itype === 16 || type === 36)) {
			// 対空値7以下の高角砲 高射装置
			antiAirBonus += 2 * Math.sqrt(remodel);
		}
		else if (antiAir > 7 && (itype === 16 || type === 36)) {
			// 対空値8以上の高角砲 高射装置
			antiAirBonus += 3 * Math.sqrt(remodel);
		}
		else if (itype === 11 && antiAir > 1) {
			// 対空値2以上の電探
			antiAirBonus += 1.5 * Math.sqrt(remodel);
		}

		return antiAirBonus;
	}

	/**
	 * スロット数バリデーション
	 * 正しい値に修正したうえで自身に格納
	 * @param {object} value
	 * @memberof Item
	 */
	validateSlot(value) {
		const slot = castInt(value);
		if (slot > MAX_SLOT) {
			this.slot = MAX_SLOT;
			this.fullSlot = MAX_SLOT;
		}
		else {
			this.slot = slot;
			this.fullSlot = slot;
		}
	}
}

/**
 * 艦娘用装備クラス
 * @class ShipItem
 * @extends {Item}
 */
class ShipItem extends Item {
	/**
	 *Creates an instance of ShipItem.
	 * @param {number} id
	 * @param {number} [slot=0]
	 * @param {number} [remodel=0]
	 * @param {number} [level=0]
	 * @memberof ShipItem
	 */
	constructor(id, slot = 0, remodel = 0, level = 0) {
		super(id, slot, remodel, level);
		/** @type {number[]} */
		this.results = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
		/** @type {number} */
		this.antiAirWeight = 0;
		/** @type {number} */
		this.antiAirBonus = 0;
		// /** @type {number} */
		// this.antiAirWeight_kai = 0;

		// ボーナス対空値抜きで
		const rawAntiAir = this.antiAir - this.bonusAntiAir;

		// 装備対空値0以上で適用
		if (rawAntiAir > 0) {
			// 加重対空値加設定
			this.antiAirWeight = Item.getAntiAirWeight(this.type, this.itype, this.remodel, rawAntiAir);
			// 艦隊防空設定
			this.antiAirBonus = Item.getAntiAirBonus(this.id, this.type, this.itype, this.remodel, rawAntiAir)
		}
	}

	/**
	 * 搭載数から航空戦基本火力を取得 キャップ適用
	 * @static
	 * @param {ShipItem} item 装備オブジェクト
	 * @param {number} slot 搭載数
	 * @param {boolean} [isUnion=false] 防御側が連合艦隊
	 * @param {boolean} [isEscort=false] 防御側が随伴か
	 * @param {boolean} [isJetMode=false] 噴式強襲モードか
	 * @returns {number[]} 火力配列
	 * @memberof ShipItem
	 */
	static getFirePower(item, slot, isUnion = false, isEscort = false, isJetMode = false) {
		// 攻撃機前提
		if (!item.isAttacker || slot < 1) {
			return [0];
		}

		// 航空戦定数: 25　対連合艦隊時に補正(主力: -10, 随伴: -20)
		const c = 25 + (isUnion ? isEscort ? -20 : -10 : 0);

		// 航空戦火力式 機体の種類別倍率 × (機体の雷装 or 爆装 × √搭載数 + 航空戦定数)
		let baseFire = 0;
		let itemPower = 0;
		const fire = [];
		const baseAntiAir = item.antiAir - item.bonusAntiAir;
		switch (item.type) {
			case 8:
				// 艦攻 雷装を適用
				itemPower = Item.getBonusTorpedo(item.type, item.remodel) + item.torpedo;
				baseFire = itemPower * Math.sqrt(slot) + c;
				fire.push(0.8 * baseFire);
				fire.push(1.5 * baseFire);
				break;
			case 7:
			case 11:
				// 爆撃機 爆装を適用
				itemPower = Item.getBonusBomber(item.id, item.type, item.remodel) + item.bomber;
				baseFire = itemPower * Math.sqrt(slot) + c;
				fire.push(baseFire);
				break;
			case 57:
				// 噴式爆撃機
				itemPower = Item.getBonusBomber(item.type, item.remodel) + item.bomber;
				baseFire = itemPower * Math.sqrt(slot) + c;

				// 噴式強襲モードかどうかで補正
				if (isJetMode) {
					fire.push(baseFire);
				}
				else {
					fire.push(baseFire / Math.SQRT2);
				}
				break;
			default:
				fire.push(0);
				break;
		}

		// キャップ値を適用したものを返却
		return fire.map(v => Math.floor(softCap(v, AS_CAP)));
	}


	/**
	 * 装備と艦娘から航空戦雷装ボーナスを返却する
	 * @static
	 * @param {Item} item
	 * @param {Ship} ship
	 * @memberof ShipItem
	 */
	static getAttackerBonus(item, ship) {
		if (item.id === 372) {
			// 天山一二型甲
			if (ship.id === 483 || ship.id === 488) {
				// 龍鳳改二 / 戊
				return 2;
			}
			else if ([33, 43].includes(ship.type2)) {
				// 翔鶴型 大鳳
				return 1;
			}
		}
		else if (item.id === 373) {
			// 天山一二型甲改(空六号電探改装備機)
			if (ship.id === 483) {
				// 龍鳳改二戊
				return 3;
			}
			else if (ship.id === 488 || [9, 33, 43].includes(ship.type2)) {
				// 龍鳳改二 最上型 翔鶴型 大鳳
				return 2;
			}
			else if ([24, 51].includes(ship.type2) || [1391, 1392, 121, 122, 1382, 355, 360].includes(ship.id)) {
				// 飛鷹型 龍鳳型　祥鳳と千歳型の改以降っぽいかんじ
				return 1;
			}
		}
		else if (item.id === 374) {
			// 天山一二型甲改(熟練/空六号電探改装備機)
			if ([261, 262, 266, 267, 156, 153].includes(ship.id)) {
				// 鶴改二 / 改二甲 大鳳
				return 3;
			}
			else if ([483, 488, 308, 309, 1383, 208].includes(ship.id)) {
				// 龍鳳改二 最上型改二 飛鷹改 隼鷹改二
				return 2;
			}
			else if ([121, 122, 1382, 355, 360, 190].includes(ship.id)) {
				// 祥鳳と千歳型最終 龍鳳改
				return 1;
			}
		}
		else if (item.id === 424) {
			// Barracuda Mk.II
			if ([315, 1473, 485, 1713].includes(ship.id)) {
				// Ark Vict
				return 3;
			}
		}
		else if (item.id === 425) {
			// Barracuda Mk.III
			if ([315, 1473, 485, 1713].includes(ship.id)) {
				// Ark Vict
				return 1;
			}
		}
		else if (item.id === 368) {
			// Swordfish Mk.III改(水上機型)
			if (ship.id === 430) {
				// Got andra
				return 2;
			}
		}
		else if (item.id === 369) {
			// Swordfish Mk.III改(水上機型/熟練)
			if (ship.id === 430) {
				// Got andra
				return 3;
			}
		}

		return 0;
	}
}

/**
 * 基地航空隊用機体クラス
 * @class LandBaseItem
 * @extends {Item}
 */
class LandBaseItem extends Item {
	/**
	 *Creates an instance of LandBaseItem.
	 * @param {number} id
	 * @param {number} [slot=0]
	 * @param {number} [remodel=0]
	 * @param {number} [level=0]
	 * @memberof LandBaseItem
	 */
	constructor(id, slot = 0, remodel = 0, level = 0) {
		super(id, slot, remodel, level);
		/** @type {number} */
		this.defenseAirPower = 0;

		// 防空計算
		this.updateDefenseAirPower();
	}

	/**
	 * オーバーライド
	 * 現在の搭載数から基地航空隊配備時の制空値を算出、更新する
	 * @memberof LandBaseItem
	 */
	updateAirPower() {
		if (this.slot <= 0) {
			this.airPower = 0;
			this.slot = 0;
			return;
		}
		this.airPower = Math.floor(this.bonusAirPower + this.actualAntiAir * Math.sqrt(this.slot));
	}

	/**
	 * 現在の搭載数から防空時の制空値を算出、更新する
	 * @memberof LandBaseItem
	 */
	updateDefenseAirPower() {
		if (this.id === 0 || this.slot <= 0) {
			this.defenseAirPower = 0;
			this.slot = 0;
			return;
		}

		let sumPower = this.bonusAirPower;
		if (this.isFighter) {
			sumPower += (this.antiAir + this.interception + 2.0 * this.antiBomber) * Math.sqrt(this.slot);
		}
		// その他
		else sumPower += this.antiAir * Math.sqrt(this.slot);

		this.defenseAirPower = Math.floor(sumPower);
	}

	/**
	 * 基地航空隊スロット数バリデーション
	 * 正しい値に修正したうえで自身に格納
	 * @param {object} value 入力値
	 * @memberof LandBaseItem
	 */
	validateSlot(value) {
		const slot = castInt(value);
		if (slot === 0) {
			// 不正な値は0
			this.slot = 0;
			this.fullSlot = 0;
		}
		else if (this.isRecon && slot > 4) {
			// 偵察機は4機以下
			this.slot = 4;
			this.fullSlot = 4;
		}
		else if (this.type === 53 && slot > 9) {
			// 重爆機は9機以下
			this.slot = 9;
			this.fullSlot = 9;
		}
		else if (slot > 18) {
			// それ以外で18機を超えていたら18機
			this.slot = 18;
			this.fullSlot = 18;
		}
		else {
			this.slot = slot;
			this.fullSlot = slot;
		}
	}

	/**
	 * 基地航空隊基本火力取得
	 * @param {number} id 機体id
	 * @param {number} slot 搭載数
	 * @param {number} remodel 改修値
	 * @param {boolean} isCritical 改修値
	 * @param {number} criticalBonus 熟練度クリティカル補正値
	 * @param {number} beforCapBonus キャップ前補正
	 * @param {number} torpedoBonus 雷装値補正
	 * @returns {number[]} 攻撃力(クリティカル, 陸攻補正のみ適用したもの)
	 */
	static getFirePower(id, slot, remodel, isCritical = false, criticalBonus = 1, beforCapBonus = 1, torpedoBonus = 1) {
		const plane = ITEM_DATA.find(v => v.id === id);
		if (!plane || slot <= 0) return 0;

		const type = Math.abs(plane.type);

		let fire = 0;
		// ※種別倍率：艦攻・艦爆・水爆 = 1.0、陸攻 = 0.8、噴式機 = 0.7071 (≒1.0/√2)　そのた0
		let adj = 0;
		// 搭載数補正
		let adj2 = 1.8;
		switch (type) {
			case 8:
				// 艦攻
				fire = Item.getBonusTorpedo(type, remodel) + plane.torpedo * torpedoBonus;
				adj = 1.0;
				break;
			case 7:
			case 11:
				// 艦爆 水爆
				fire = Item.getBonusBomber(id, type, remodel) + plane.bomber * torpedoBonus;
				adj = 1.0;
				break;
			case 57:
				// 噴式機
				fire = Item.getBonusBomber(id, type, remodel) + plane.bomber * torpedoBonus;
				adj = 0.7071;
				break;
			case 47:
				// 陸上攻撃機
				fire = Item.getBonusTorpedo(type, remodel) + plane.torpedo * torpedoBonus;
				adj = 0.8;
				break;
			case 53:
				// 大型陸上機
				fire = Item.getBonusTorpedo(type, remodel) + plane.torpedo * torpedoBonus;
				adj = 1.0;
				adj2 = 1.0;
				break;
			default:
				break;
		}

		// 基本攻撃力 = 種別倍率 × {(雷装 or 爆装) × √(搭載数補正 × 搭載数) + 25} * キャップ前ボーナス
		let p = Math.floor(adj * (fire * Math.sqrt(adj2 * slot) + 25) * beforCapBonus);

		// キャップ
		p = softCap(p, AS_CAP);

		if (isCritical) {
			// クリティカル時
			p = Math.floor(p * 1.5 * criticalBonus);
		}

		// 陸攻補正
		const landBaseBonus = type === 47 ? 1.8 : 1;

		return p * landBaseBonus;
	}

	/**
	 * 基地航空隊 対地攻撃力取得
	 * @static
	 * @param {LandBaseItem} item
	 * @param {number} slot
	 * @param {boolean} isCritical
	 * @param {number} criticalBonus
	 * @param {Enemy} enemy
	 * @memberof LandBaseItem
	 */
	static getFirePowerLandBase(item, slot, isCritical, criticalBonus, enemy) {
		if (slot <= 0) return 0;

		const type = Math.abs(item.type);
		let fire = 0;
		// 基本攻撃力 = 種別倍率 × {(雷装 or 爆装) × √(1.8 × 搭載数) + 25}
		// ※種別倍率：艦攻・艦爆・水爆 = 1.0、陸攻 = 0.8、噴式機 = 0.7071 (≒1.0/√2)　そのた0
		let adj = 0;
		switch (type) {
			case 8:
				// 艦攻
				fire = Item.getBonusTorpedo(type, item.remodel) + item.torpedo;
				adj = 1.0;
				break;
			case 7:
			case 11:
				// 艦爆 水爆
				fire = Item.getBonusBomber(item.id, type, item.remodel) + item.bomber;
				adj = 1.0;
				break;
			case 57:
				fire = Item.getBonusBomber(item.id, type, item.remodel) + item.bomber;
				adj = 0.7071;
				break;
			case 47:
				// 陸上攻撃機　大型陸上機　爆装を利用する
				fire = item.bomber;
				adj = 0.8;
				break;
			default:
				break;
		}

		// 基本攻撃力 = 種別倍率 × {(雷装 or 爆装) × √(1.8 × 搭載数) + 25}
		let p = adj * (fire * Math.sqrt(1.8 * slot) + 25);

		// 爆撃特効適用対象機体か　艦爆 水爆 陸攻 噴式
		const isBomber = [7, 11, 47, 53, 57].includes(item.type);

		// 砲台　離島 集積地特効
		// [[基本攻撃力 × 基地航空特効(砲台・離島姫) × 爆撃特効(集積地) + 基地航空特効(集積地)] × 爆撃特効(砲台・離島姫)]
		// 基地航空特効(全ての機体)
		if ([165, 166, 167].includes(enemy.id)) {
			// 砲台小鬼 基地航空特効 1.6　爆撃特効 1.55
			p = Math.floor(Math.floor(softCap(p * 1.6, AS_CAP)) * (isBomber ? 1.55 : 1));
		}
		else if ([168, 169, 171, 172].includes(enemy.id)) {
			// 離島棲姫 基地航空特効 1.18　爆撃特効 1.7
			p = Math.floor(Math.floor(softCap(p * 1.18, AS_CAP)) * (isBomber ? 1.7 : 1));
		}
		else if (enemy.name.indexOf('集積地') >= 0) {
			// 集積地 基地航空特効 +100　爆撃特効 2.1
			p = Math.floor(softCap(p, AS_CAP) * (isBomber ? 2.1 : 1) + 100);
		}

		if (isCritical) {
			// クリティカル時
			p = Math.floor(p * 1.5 * criticalBonus);
		}

		// 陸攻補正
		const landBaseBonus = type === 47 ? 1.8 : 1;
		return p * landBaseBonus;
	}


	/**
	 * 65戦隊 かつ駆逐用火力計算
	 * @static
	 * @param {LandBaseItem} item
	 * @param {number} slot
	 * @param {boolean} isCritical
	 * @param {number} criticalBonus
	 * @returns {number} 火力
	 * @memberof LandBaseItem
	 */
	static getFirePower_SP(item, slot, isCritical, criticalBonus) {
		if (slot <= 0) return 0;

		let fire = 0;
		let adj = 0.8;

		let p = 0;
		if (item.id === 224) {
			// 65戦隊固定 雷装値25として計算
			fire = 25 + Item.getBonusTorpedo(item.type, item.remodel);
			// 基本攻撃力 = 種別倍率 × {(雷装 or 爆装) × √(1.8 × 搭載数) + 25}
			p = Math.floor(adj * (fire * Math.sqrt(1.8 * slot) + 25));
		}

		// キャップ
		p = softCap(p, AS_CAP);
		if (isCritical) p = Math.floor(p * 1.5 * criticalBonus);
		// 陸攻補正
		const landBaseBonus = 1.8;
		return p * landBaseBonus;
	}
}

/**
 * 専ら装備一覧表示用のクラス
 * @class ItemDetail
 * @extends {Item}
 */
class ItemDetail extends Item {
	/**
	 *Creates an instance of ItemDetail.
	* @param {number} id
	* @param {number} [remodel=0]
	* @param {number} [stock=0]
	* @memberof ItemDetail
	*/
	constructor(id, remodel = 0, stock = 0) {
		super(id, 0, remodel);
		/** @type {number} */
		this.fire = 0;
		/** @type {number} */
		this.torpedo = 0;
		/** @type {number} */
		this.bomber = 0;
		/** @type {number} */
		this.armor = 0;
		/** @type {number} */
		this.asw = 0;
		/** @type {number} */
		this.avoid2 = 0;
		/** @type {number} */
		this.range2 = 0
		/** @type {number} */
		this.stock = stock;
		/** @type {number} */
		this.battleAntiAir = 0;
		/** @type {number} */
		this.defenseAntiAir = 0;
		/** @type {number} */
		this.antiAirWeight = 0;
		/** @type {number} */
		this.antiAirBonus = 0;
		/** @type {number} */
		this.grow = 0;
	}

	/**
	 * ステータス最終調整
	 * @memberof ItemDetail
	 */
	setAllStatus() {
		// 加重対空値
		this.antiAirWeight = Item.getAntiAirWeight(this.type, this.itype, this.remodel, this.antiAir);
		// 艦隊防空値
		this.antiAirBonus = Item.getAntiAirBonus(this.id, this.type, this.itype, this.remodel, this.antiAir);

		// 各種改修値によるボーナスを設定
		if (this.remodel) {
			// ボーナス火力
			this.fire += Item.getBonusFire(this.type, this.remodel);
			// ボーナス雷装
			this.torpedo += Item.getBonusTorpedo(this.type, this.remodel);
			// ボーナス爆装
			this.bomber += Item.getBonusBomber(this.id, this.type, this.remodel);
			// ボーナス対潜
			this.asw += Item.getBonusASW(this.id, this.type, this.remodel, this.antiAir);
			// ボーナス索敵
			this.scout += Item.getBonusScout(this.type, this.remodel);
			// ボーナス命中
			this.accuracy += Item.getBonusAccuracy(this.id, this.type, this.remodel);
			// ボーナス対空
			this.antiAir += Item.getBonusAntiAir(this.id, this.type, this.remodel, this.antiAir);
		}

		// 出撃対空値
		this.battleAntiAir = this.antiAir + 1.5 * this.interception;
		// 防空対空値
		this.defenseAntiAir = this.antiAir + this.interception + 2.0 * this.antiBomber;
	}
}

/**
 * 基地制空戦結果
 * @class
 */
class AirStatusResult {
	constructor() {
		/** @type {number[]} */
		this.mainAirPower = [0, 0];
		/** @type {number[]} */
		this.enemyAirPower = [0, 0];
		/** @type {number[][]} */
		this.airStatusIndex = [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]];
	}
}


class BattleData {
	constructor() {
		/** @type {Battle[]} */
		this.battles = [];
	}
}

class Battle {
	constructor() {
		/** @type {Enemy[]} */
		this.enemies = [];
		/** @type {number} */
		this.cellType = 0;
		/** @type {any} */
		this.stage2 = [];
		/** @type {boolean} */
		this.isAllSubmarine = false;
		/** @type {number} */
		this.formation = 0;
		/** @type {boolean} */
		this.enabledStage2 = false;
		/** @type {boolean} */
		this.isUnion = false;
		/** @type {boolean} */
		this.hasAntiAirCI = false;
		/** @type {boolean} */
		this.containUnknown = false;
	}

	/**
	 * この戦闘の現在の制空値を返却 - 基地
	 * @returns 制空値
	 * @memberof Battle
	 */
	getLandBaseAirPower() {
		let sumAP = 0;
		const max_i = this.enemies.length;
		for (let i = 0; i < max_i; i++) {
			sumAP += this.enemies[i].landBaseAirPower;
		}
		return sumAP;
	}

	/**
	 * この戦闘の現在の制空値を返却 - 通常
	 * @returns 制空値
	 * @memberof Battle
	 */
	getAirPower() {
		let sumAP = 0;
		const max_i = this.enemies.length;
		for (let i = 0; i < max_i; i++) {
			sumAP += this.enemies[i].airPower;
		}
		return sumAP;
	}

	/**
	 * この敵艦隊クラスからstage2テーブルを生成
	 */
	createStage2Table() {
		const stage2 = [[[], []], [[], []], [[], []], [[], []], [[], []], [[], []]];
		const enemyCount = this.enemies.length;

		if (enemyCount === 0) {
			return;
		}

		// 詳細設定入力欄の値を格納
		AVOID_TYPE[5].adj[0] = castFloat($('#free_anti_air_weight').val());
		AVOID_TYPE[5].adj[1] = castFloat($('#free_anti_air_bornus').val());;

		// 陣形補正
		const formation = FORMATION.find(v => v.id === this.formation);
		const aj1 = formation ? formation.correction : 1.0;
		// 艦隊防空ボーナス合計
		const sumAntiAirBonus = Math.floor(getArraySum(this.enemies.map(v => v.antiAirBonus)));
		// 艦隊防空 => int(陣形補正 * 各艦の艦隊対空ボーナス合計)
		const fleetAntiAir = Math.floor(sumAntiAirBonus * aj1);

		for (let i = 0; i < enemyCount; i++) {
			const enm = this.enemies[i];
			if (enm.id === 0) continue;
			// 途中で死ぬ設定の敵を飛ばす
			if (enm.isDead) continue;

			// 連合艦隊補正
			const unionFactor = this.isUnion && enm.isEscort ? 0.48 : this.isUnion && !enm.isEscort ? 0.8 : 1.0;

			// 各回避補正毎にテーブルを作成
			for (let j = 0; j < AVOID_TYPE.length; j++) {
				// 対空射撃補正
				const avoid1 = AVOID_TYPE[j].adj[0];
				const avoid2 = AVOID_TYPE[j].adj[1];

				// 艦船加重対空値
				let antiAirWeight = 0;
				if (avoid1 === 1.0) {
					// 艦船加重対空値 => int(sqrt(素対空 + 装備対空)) + Σ(装備対空値 * 装備倍率)
					antiAirWeight = Math.floor(Math.sqrt(enm.antiAir + enm.sumItemAntiAir)) + enm.equipmentsAAWeight;
				}
				else {
					// 艦船加重対空値 => int((int(sqrt(素対空 + 装備対空)) + Σ(装備対空値 * 装備倍率)) * 対空射撃回避補正)
					antiAirWeight = Math.floor((Math.floor(Math.sqrt(enm.antiAir + enm.sumItemAntiAir)) + enm.equipmentsAAWeight) * avoid1);
				}

				// 艦隊防空補正
				let fleetAA = 0;
				if (avoid2 === 1.0) {
					// 艦隊防空補正 => 艦隊防空
					fleetAA = fleetAntiAir;
				}
				else {
					// 艦隊防空補正 => int(艦隊防空 * 対空射撃回避補正(艦隊防空ボーナス))
					fleetAA = Math.floor(fleetAntiAir * avoid2);
				}

				// 割合撃墜 => int(0.02 * 0.25 * 機数[あとで] * 艦船加重対空値 * 連合補正)
				stage2[j][0].push(0.02 * 0.25 * antiAirWeight * unionFactor);
				// 固定撃墜 => int((加重対空値 + 艦隊防空補正) * 基本定数(0.25) * 敵補正(0.75) * 連合補正)
				stage2[j][1].push(Math.floor((antiAirWeight + fleetAA) * 0.75 * 0.25 * unionFactor));
			}
		}

		this.stage2 = stage2;
	}
}

class Enemy {
	/**
	 * Creates an instance of Enemy.
	 * @param {number} id
	 * @memberof Enemy
	 */
	constructor(id) {
		/** @type {number} */
		this.id = 0;
		/** @type {number[]} */
		this.type = [];
		/** @type {string} */
		this.name = "";
		/** @type {number[]} */
		this.antiAirs = [];
		/** @type {number[]} */
		this.slots = [];
		/** @type {number[]} */
		this.fullSlots = [];
		/** @type {number[]} */
		this.rawSlots = [];
		/** @type {number} */
		this.airPower = 0;
		/** @type {number} */
		this.fullAirPower = 0;
		/** @type {number} */
		this.landBaseAirPower = 0;
		/** @type {number} */
		this.fullLandBaseAirPower = 0;
		/** @type {number} */
		this.antiAirWeight = 0;
		/** @type {number} */
		this.antiAirBonus = 0;
		/** @type {boolean[]} */
		this.attackers = [];
		/** @type {EnemyItem[]} */
		this.equipments = [];
		/** @type {boolean} */
		this.onlyScout = false;
		/** @type {number} */
		this.antiAir = 0;
		/** @type {number} */
		this.hp = 0;
		/** @type {number} */
		this.armor = 0;
		/** @type {number} */
		this.sumItemArmor = 0;
		/** @type {number} */
		this.sumItemAntiAir = 0;
		/** @type {number} */
		this.equipmentsAAWeight = 0;
		/** @type {boolean} */
		this.isEscort = false;
		/** @type {boolean} 途中で死ぬ想定 */
		this.isDead = false;

		const raw = ENEMY_DATA.find(v => v.id === id);
		if (raw) {
			for (let i = 0; i < raw.eqp.length; i++) {
				const id = raw.eqp[i];
				// 装備マスタから取得
				const equipment = new EnemyItem(id);
				// 装備装甲値加算
				this.sumItemArmor += equipment.armor;
				// 装備対空加算
				this.sumItemAntiAir += equipment.antiAir;
				// 装備対空 * 装備倍率 加算
				this.equipmentsAAWeight += equipment.antiAirWeight;
				// 艦隊防空ボーナス加算 この後小数点以下切り捨て
				this.antiAirBonus += equipment.antiAirBonus;

				// 装備品追加
				this.equipments.push(equipment);

				// 機体なら計算用の格納
				if (equipment && equipment.isPlane) {
					const slot = raw.slot[i] > 0 ? raw.slot[i] : 0;
					this.antiAirs.push(equipment.antiAir);
					this.attackers.push(ATTACKERS.includes(equipment.type));
					this.slots.push(slot);
					this.fullSlots.push(slot);

					// いまは偵察機が1つでも含まれてたら偵察機onlyとする => 基地制空のみに加算
					if (!this.onlyScout && equipment.isScout) {
						this.onlyScout = true;
					}
				}
			}

			this.id = raw.id;
			this.type = raw.type;
			this.name = raw.name;
			this.antiAir = raw.aa;
			this.hp = raw.hp;
			this.armor = raw.armor;
			this.airPower = 0;
			this.landBaseAirPower = 0;
			this.rawSlots = raw.slot.concat();

			// 制空値情報の更新
			this.updateAirPower();

			this.fullAirPower = this.airPower;
			this.fullLandBaseAirPower = this.landBaseAirPower;

			// 艦船加重対空(表示用ブラウザ版2倍 計算には特に使わない) => int( sqrt(素対空 + 装備対空) ) + Σ(装備対空 * 装備倍率) 
			this.antiAirWeight = 2 * Math.floor(Math.sqrt(this.antiAir + this.sumItemAntiAir)) + 2 * this.equipmentsAAWeight;
			// 艦隊防空ボーナス切捨て
			this.antiAirBonus = Math.floor(this.antiAirBonus);
		}
	}

	updateAirPower() {
		if (this.id < 0) return;
		this.airPower = 0;
		this.landBaseAirPower = 0;
		const max_i = this.antiAirs.length;
		let sumAp = 0;
		for (let i = 0; i < max_i; i++) {
			sumAp += Math.floor(this.antiAirs[i] * Math.sqrt(Math.floor(this.slots[i])));
		}
		this.landBaseAirPower = sumAp;

		if (!this.onlyScout || isDefMode) {
			this.airPower = sumAp;
		}
	}
}

/**
 * 装備品クラス
 * @class EnemyItem
 */
class EnemyItem {
	/**
	 *Creates an instance of EnemyItem.
	 * @param {number} id
	 * @memberof EnemyItem
	 */
	constructor(id) {
		/** @type {number} */
		this.id = 0;
		/** @type {number} */
		this.type = 0;
		/** @type {string} */
		this.name = "";
		/** @type {number} */
		this.antiAir = 0;
		/** @type {number} */
		this.antiAirWeight = 0;
		/** @type {number} */
		this.antiAirBonus = 0;
		/** @type {boolean} */
		this.isPlane = false;
		/** @type {boolean} */
		this.isAttacker = false;
		/** @type {boolean} */
		this.isScout = false;
		/** @type {number} */
		this.armor = 0;
		/** @type {number} */
		this.torpedo = 0;
		/** @type {number} */
		this.bomber = 0;

		const raw = ENEMY_ITEM.find(v => v.id === id);
		if (raw) {
			this.id = raw.id;
			this.name = raw.name;
			this.type = raw.type;
			this.itype = raw.itype;
			this.antiAir = raw.antiAir;
			this.armor = raw.armor;
			this.torpedo = raw.torpedo;
			this.bomber = raw.bomber;
			this.isPlane = PLANE_TYPE.includes(raw.type);
			this.isAttacker = ATTACKERS.includes(raw.type);
			this.isScout = RECONNAISSANCES.includes(raw.type);

			// 加重対空値部品 => 装備対空値 * 装備倍率
			if (this.itype === 16) {
				// 高角砲
				this.antiAirWeight = this.antiAir * 2;

			} else if (this.itype === 11) {
				// 電探
				this.antiAirWeight = this.antiAir * 1.5;
			}
			else if (this.type === 21) {
				// 機銃
				this.antiAirWeight = this.antiAir * 3;
			}

			// 艦隊防空ボーナス
			if (this.itype === 16) {
				// 高角砲
				this.antiAirBonus = this.antiAir * 0.35;
			}
			else if (this.itype === 11) {
				// 電探
				this.antiAirBonus = this.antiAir * 0.4;
			}
			else if (this.type === 18) {
				// 対空強化弾(三式 該当なし)
				this.antiAirBonus = this.antiAir * 0.6;
			}
			else {
				// その他
				this.antiAirBonus = this.antiAir * 0.2;
			}
		}
	}

	/**
	 * 搭載数から航空戦基本火力を取得 キャップ適用
	 * @static
	 * @param {number} slot 搭載数
	 * @param {boolean} [isUnion=false] 防御側が連合艦隊
	 * @param {boolean} [isEscort=false] 防御側が随伴か
	 * @returns {number[]} 火力配列
	 * @memberof EnemyItem
	 */
	getFirePower(slot, isUnion = false, isEscort = false) {
		// 攻撃機前提
		if (!this.isAttacker) {
			return [0];
		}
		// 航空戦定数: 25　対連合艦隊時に補正(主力: -10, 随伴: -20)
		const c = 25 + (isUnion ? isEscort ? -20 : -10 : 0);
		// 航空戦火力式 機体の種類別倍率 × (機体の雷装 or 爆装 × √搭載数 + 航空戦定数)
		let baseFire = 0;
		let itemPower = 0;
		const fire = [];
		switch (this.type) {
			case 8:
				if (slot <= 0) return [0, 0];
				// 艦攻 雷装を適用
				itemPower = this.torpedo;
				// 基本攻撃力: 雷装 × √搭載数 + 25
				baseFire = itemPower * Math.sqrt(slot) + c;
				fire.push(0.8 * baseFire);
				fire.push(1.5 * baseFire);
				break;
			case 7:
			case 11:
				if (slot <= 0) return [0];
				// 爆撃機 爆装を適用
				itemPower = this.bomber;
				// 基本攻撃力: 雷装 × √搭載数 + 25
				baseFire = itemPower * Math.sqrt(slot) + c;
				fire.push(baseFire);
				break;
			default:
				fire.push(0);
				break;
		}

		// キャップ値を適用したものを返却
		return fire.map(v => Math.floor(softCap(v, AS_CAP)));
	}
}

/*==================================
		汎用
==================================*/
/**
 * arrayとdiffArray内に1つでも同じ値がある場合true
 * @param {Array} array
 * @param {Array} diffArray
 * @returns 同じ値が1つでも両配列に存在すればtrue
 */
function isContain(array, diffArray) {
	for (const value1 of array) {
		for (const value2 of diffArray) {
			if (value1 === value2) return true;
		}
	}
	return false;
}

/**
 * 配列のシャッフル (Fisher-Yates shuffle)
 * @param {Array} array
 */
function shuffleArray(array) {
	const length = array.length;
	for (let i = length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const tmp = array[i];
		array[i] = array[j];
		array[j] = tmp;
	}
}

/**
 * 数値配列の合計値を返却(処理速度優先)
 * @param {number[]} array 数値配列
 * @returns {number} 合計値
 */
function getArraySum(array) {
	let sum = 0;
	let i = array.length;
	while (i--) {
		sum += array[i];
	}
	return sum;
}

/**
 * 数値配列の最大値を返却(処理速度優先 / 大きい値でapplyやスプレッド演算子が落ちるため)
 * @param {number[]} array 数値配列
 * @returns {number} 合計値
 */
function getArrayMax(array) {
	let max = -Infinity;
	let i = array.length;
	while (i--) {
		if (array[i] > max) max = array[i];
	}
	return max;
}

/**
 * 数値配列の最小値を返却(処理速度優先 / 大きい値でapplyやスプレッド演算子が落ちるため)
 * @param {number[]} array 数値配列
 * @returns {number} 合計値
 */
function getArrayMin(array) {
	let min = Infinity;
	let i = array.length;
	while (i--) {
		if (array[i] < min) min = array[i];
	}
	return min;
}

/**
 * ステータス表示用のフォーマット
 * 小数以下があれば第1位のみ表示 第2位以下は切り捨てる
 * 対空射撃回避の場合はマスタから文字列取得
 * @param {object} value
 * @param {string} [label=""]
 * @returns
 */
function sFormat(value, label = "") {
	if (!value) return "";
	if (label === 'avoid') {
		const o = AVOID_TYPE.find(v => v.id === value);
		return o ? o.name : '';
	}
	return value % 1 ? Math.floor(value * 10) / 10 : value.toString();
}

/**
 * キャップ適用値を返却
 * @param {number} power キャップ前火力
 * @param {number} cap キャップ値
 * @returns {number} キャップ後火力
 */
function softCap(power, cap) {
	return power > cap ? cap + Math.sqrt(power - cap) : power;
}

/**
 * 米艦か判定
 * @param {number} type
 * @returns {boolean} 
 */
function isUSA(type) {
	return USA.includes(type);
}

/**
 * 伊艦か判定
 * @param {number} type
 * @returns {boolean} 
 */
function isITA(type) {
	return ITA.includes(type);
}

/**
 * 英艦か判定
 * @param {number} type
 * @returns {boolean} 
 */
function isGBR(type) {
	return GBR.includes(type);
}

/**
 * ドイツ艦か判定
 * @param {number} type
 * @returns {boolean} 
 */
function isDEU(type) {
	return DEU.includes(type);
}

/**
 * フランス艦か判定
 * @param {number} type
 * @returns {boolean}
 */
function isFRA(type) {
	return FRA.includes(type);
}

/**
 * ロシア艦か判定
 * @param {number} type
 * @returns {boolean}
 */
function isRUS(type) {
	return RUS.includes(type);
}

/**
 * スウェーデン艦か判定
 * @param {number} type
 * @returns {boolean}
 */
function isSWE(type) {
	return SWE.includes(type);
}

/**
 * オーストラリア艦か判定
 * @param {number} type
 * @returns {boolean}
 */
function isAUS(type) {
	return AUS.includes(type);
}

/**
 * オランダ艦か判定
 * @param {number} type
 * @returns {boolean}
 */
function isNLD(type) {
	return NLD.includes(type);
}

/**
 * 日本艦か判定
 * @param {number} type
 * @returns {boolean} 英艦ならture
 */
function isJPN(type) {
	return !isUSA(type) && !isITA(type) && !isGBR(type) && !isDEU(type) && !isFRA(type) && !isRUS(type) && !isSWE(type) && !isAUS(type) && !isNLD(type);
}
/*==================================
		値/オブジェクト 作成・操作・取得等
==================================*/

/**
 * 事前計算テーブルがメモリになければ生成
 */
function setPreCalculateTable() {
	// 制空ボーダーテーブル
	if (!AIR_STATUS_TABLE) {
		AIR_STATUS_TABLE = [];
		const max_ap = 1000;
		for (let i = 0; i <= max_ap; i++) {
			const tmp = new Uint16Array(Math.max(3 * i + 1, 2));
			for (let j = 0; j <= tmp.length; j++) {
				if (i === 0 && j === 0) tmp[j] = 5;
				else if (i >= 3 * j) tmp[j] = 0;
				else if (2 * i >= 3 * j) tmp[j] = 1;
				else if (3 * i > 2 * j) tmp[j] = 2;
				else if (3 * i > j) tmp[j] = 3;
				else {
					tmp[j] = 4;
					break;
				}
			}
			AIR_STATUS_TABLE.push(tmp);
		}
	}

	// 敵撃墜テーブル
	if (!SHOOT_DOWN_TABLE_ENEMY) {
		SHOOT_DOWN_TABLE_ENEMY = [];
		let enemyMaxSlot = 0;
		const enemyLen = ENEMY_DATA.length;
		for (let i = 0; i < enemyLen; i++) {
			const slotLen = ENEMY_DATA[i].slot.length;
			for (let j = 0; j < slotLen; j++) {
				if (enemyMaxSlot < ENEMY_DATA[i].slot[j]) enemyMaxSlot = ENEMY_DATA[i].slot[j];
			}
		}
		for (let slot = 0; slot <= enemyMaxSlot; slot++) {
			const tmpA = [];
			const airLen = AIR_STATUS.length;
			for (let i = 0; i < airLen; i++) {
				let tmpB = [];
				const rand_max = AIR_STATUS[i].rate;
				for (let x = rand_max; x >= 0; x--) {
					for (let y = 0; y <= rand_max; y++) {
						const value = Math.floor(slot * (0.65 * x + 0.35 * y) / 10);
						tmpB.push(value);
					}
				}
				shuffleArray(tmpB);
				tmpA.push(tmpB);
			}
			SHOOT_DOWN_TABLE_ENEMY.push(tmpA);
		}
	}

	// メモリ解放タイマー設定
	window.clearTimeout(releaseTimer);
	// 3分おきに重いメモリ解放
	releaseTimer = setTimeout(function () {
		AIR_STATUS_TABLE = null;
		SHOOT_DOWN_TABLE_ENEMY = null;
	}, 180000);
}

/**
 * 装備一覧用データソースの初期化
 */
function updateItemList() {
	// 初期化
	ITEM_LIST.splice(0);
	// 所持数ロード
	const stockData = loadPlaneStock();
	for (const item of ITEM_DATA) {
		const stock = stockData.find(v => v.id === item.id);
		if (stock && stock.num.some(v => v > 0)) {
			for (let remodel = 0; remodel <= 10; remodel++) {
				const stockCount = stock.num[remodel];
				if (stockCount === 0) continue;
				// 改修値0～10で見つかったものを個数とともに格納
				const itemInstance = new ItemDetail(item.id, remodel, stockCount);
				// 基礎ステ設定しなおし
				itemInstance.fire = item.fire;
				itemInstance.antiAir = item.antiAir;
				itemInstance.torpedo = item.torpedo;
				itemInstance.bomber = item.bomber;
				itemInstance.accuracy = item.accuracy;
				itemInstance.scout = item.scout;
				itemInstance.avoid2 = item.avoid2;
				itemInstance.asw = item.asw;
				itemInstance.armor = item.armor;
				itemInstance.range2 = item.range2;
				itemInstance.grow = item.grow;

				// 基礎ステータスの加算と改修によるボーナス値を設定
				itemInstance.setAllStatus();

				ITEM_LIST.push(itemInstance);
			}
		}

		// 未改修のものを追加 所持数は共通品として-1
		const buffer = new ItemDetail(item.id, 0, -1);
		// 基礎ステ補足
		buffer.fire = item.fire;
		buffer.antiAir = item.antiAir;
		buffer.torpedo = item.torpedo;
		buffer.bomber = item.bomber;
		buffer.accuracy = item.accuracy;
		buffer.scout = item.scout;
		buffer.avoid2 = item.avoid2;
		buffer.asw = item.asw;
		buffer.armor = item.armor;
		buffer.range2 = item.range2;
		buffer.grow = item.grow;

		// 基礎ステータスの加算と改修によるボーナス値を設定
		buffer.setAllStatus();

		ITEM_LIST.push(buffer);
	}
}

/**
 * 艦載機カテゴリアイコンで艦載機をフィルタし返却
 * @param {number} type カテゴリ　0の場合、全艦載機
 * @returns {object} 艦載機データ
 */
function getItemsForIcon(type) {
	let items = [];
	if (type === 0) items = ITEM_LIST.concat();
	// 水上機
	else if (type === 10) items = ITEM_LIST.filter(v => v.type === 10 || v.type === 11);
	// 陸攻
	else if (type === 47) items = ITEM_LIST.filter(v => v.type === 47 || v.type === 53);
	// 電探
	else if (type === 12) items = ITEM_LIST.filter(v => v.type === 12 || v.type === 13);
	// 魚雷
	else if (type === 5) items = ITEM_LIST.filter(v => v.type === 5 || v.type === 22 || v.type === 32);
	// ソナー / 爆雷
	else if (type === 14) items = ITEM_LIST.filter(v => v.type === 14 || v.type === 15 || v.type === 40);
	// 輸送装備系
	else if (type === 24) items = ITEM_LIST.filter(v => [24, 30, 46].includes(v.type));
	// その他もろもろ
	else if (type === 17) items = ITEM_LIST.filter(v => [17, 18, 19, 23, 25, 26, 27, 28, 29, 31, 33, 34, 35, 36, 37, 39, 42, 43, 44, 50, 51].includes(v.type));
	// それ以外
	else items = ITEM_LIST.filter(v => v.type === type);
	return items;
}

/**
 * 渡されたカテゴリと同じ分類で返却されるカテゴリ ↑の処理の逆というかなんというか…
 * @param {number} type
 * @returns {number}
 */
function convertItemType(type) {
	switch (type) {
		case 10:
		case 11:
			return 10;
		case 47:
		case 53:
			return 47;
		case 12:
		case 13:
			return 12;
		case 5:
		case 22:
		case 32:
			return 5;
		case 14:
		case 15:
		case 40:
			return 14;
		case 24:
		case 30:
		case 46:
			return 24;
		default:
			if ([17, 18, 19, 23, 25, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36, 37, 39, 42, 43, 44, 50, 51].includes(type)) {
				return 17;
			}
			else {
				return type;
			}
	}
}

/**
 * 機体カテゴリからcssクラスを返却
 * @param {number} typeCd カテゴリコード
 * @returns {string} cssクラス名
 */
function getItemCss(typeCd) {
	const typeData = ITEM_ICON_TYPE.find(v => v.id === castInt(typeCd));
	return typeData ? typeData.css : '';
}

/**
 * 熟練度レベルから文字を返却
 * @param {number} remodel 熟練度lv
 * @returns {string}
 */
function getProfString(remodel) {
	switch (remodel) {
		case 1:
			return "|";
		case 2:
			return "||";
		case 3:
			return "|||";
		case 4:
			return "/";
		case 5:
			return "//";
		case 6:
			return "///";
		case 7:
			return ">>";
	}
	return "";
}

/**
 * 成長定数から所要戦闘回数を返却
 * @param {number} grow 成長定数
 * @returns {string} 所要戦闘回数文字列
 */
function getRequiredgBattleCountString(grow) {
	// 求ム計算式
	switch (grow) {
		case 1:
			return "-";
		case 2:
			return "100戦";
		case 3:
			return "57 ~ 75戦";
		case 4:
			return "39 ~ 47戦";
		case 5:
			return "31 ~ 40戦";
		case 6:
			return "25 ~ 31戦";
		case 7:
			return "20 ~ 28戦";
		case 8:
			return "18 ~ 23戦";
		case 9:
			return "16 ~ 20戦";
		default:
			return "不明";
	}
}

/**
 * 漢数字を数字に変換
 * @param {string} word 入力値
 */
function replaceKnji(word) {
	if (word) {
		word = word.replace('601', '六〇一');
		word = word.replace('634', '六三四');
		word = word.replace('931', '九三一');
		word = word.replace('22', '二二');
		word = word.replace('34', '三四');
		word = word.replace('96', '九六');
		word = word.replace('97', '九七');
		word = word.replace('99', '九九');
	}
	return word;
}

/**
 * 第1引数のidの艦娘に対する第2引数の艦載機の適正 装備可能ならtrue
 * 基地ならtrue 艦娘未指定なら基地機体以外true
 * @param {number} shipID 艦娘id(基地航空隊:-1 艦娘未指定:0 艦娘:艦娘id)
 * @param {Object} item 装備オブジェクト data.js参照
 * @param {number} [slotIndex=0] スロット番号 未指定ならこの要素でチェックしない
 * @returns {boolean} 装備できるなら true
 */
function checkInvalidItem(shipID, item, slotIndex = -1) {
	// なんだろうこれ
	if (shipID === -1) return true;
	// 艦娘指定なし　基地機体 => 絶対無理！
	if (shipID === 0 && LB_PLANE_TYPE.includes(item.type)) return false;
	// 艦娘指定なし なんでもOK！
	else if (shipID === 0) return true;

	// 装備可能カテゴリ
	let types = [];

	// マスタから艦娘取得
	const ship = SHIP_DATA.find(v => v.id === shipID);

	// 補強増設？
	const isExpandedSlot = slotIndex >= ship.slot.length;

	// 補強増設枠 強化缶は無理なのでfalse固定
	if (isExpandedSlot) {
		if (item.id === 34 || item.id === 87) {
			return false;
		}
		// 補強増設 特別枠
		const specialItem = EXPANDED_SPECIAL_ITEM.find(v => v.itemId === item.id);
		if (specialItem && specialItem.shipApiIds.includes(ship.api)) {
			return true;
		}

		// 潜水艦 & 後部魚雷
		if ([442, 443].includes(item.id) && (ship.type === 13 || ship.type === 14)) {
			return true;
		}
	}
	else {
		// 装甲空母のみ試製景雲OK
		if (item.id === 151) {
			return ship.type === 18;
		}

		// 戦艦系のみ15m二重測距儀+21号電探改二OK
		if (item.id === 142) {
			return (ship.type === 8 || ship.type === 9 || ship.type === 10);
		}

		// 51cm砲は長門型改以上か大和型のみ
		if (item.id === 128 || item.id === 281) {
			return ship.type2 === 37 || (ship.type2 === 19 && ship.ver > 0);
		}
	}

	// 特定艦娘 特殊装備カテゴリ取得
	const special = SPECIAL_LINK_SHIP_ITEM.find(v => v.apiShip === ship.api);
	if (special) {
		// 特殊装備カテゴリ枠から取得
		types = special.itemType;

		// 補強増設可能装備で絞る
		if (isExpandedSlot) {
			types = types.filter(v => EXPANDED_ITEM_TYPE.includes(v));
		}
	}
	else {
		// 通常艦種装備可能から取得
		types = LINK_SHIP_ITEM.find(v => v.type === ship.type).e_type;

		// 補強増設可能装備で絞る
		if (isExpandedSlot) {
			types = types.filter(v => EXPANDED_ITEM_TYPE.includes(v));
		}
	}

	// スロット番号制限チェック
	if (slotIndex >= 0) {
		const forbiddens = FORBIDDEN_LINK_SHIP_ITEM.find(v => v.shipId === shipID && v.index.includes(slotIndex + 1));
		if (forbiddens) {
			// 禁止カテゴリに存在したら終わり
			if (forbiddens.itemType.includes(item.type)) {
				return false;
			}
			// 禁止装備　キメ撃ち
			if (forbiddens.itemIDs.includes(item.id)) {
				return false;
			}
		}
	}

	// 最終チェック
	return types.includes(item.type);
}

/**
 * 数値入力バリデーション
 * @param {string} value 入力文字列
 * @param {number} max 最大値
 * @param {number} min 最小値　未指定時0
 * @returns {number} 検証結果数値
 */
function validateInputNumber(value, max, min = 0) {
	const regex = new RegExp(/^[0-9]+$/);
	let ret = 0;

	if (!regex.test(value)) ret = min;
	else if (value > max) ret = max;
	else if (value < min) ret = min;
	else ret = castInt(value);

	return ret;
}

/**
 * 数値入力バリデーション
 * @param {string} value 入力文字列
 * @param {number} max 最大値
 * @param {number} min 最小値　未指定時0
 * @returns {number} 検証結果数値
 */
function validateInputNumberFloat(value, max, min = 0) {
	const regex = new RegExp(/^\d+(\.\d+)?$/);
	let ret = 0;

	if (value.length > 5) value = value.slice(0, 5);
	else if (value.length === 0) value = "0";

	if (!regex.test(value)) ret = min;
	else if (value > max) ret = max;
	else if (value < min) ret = min;
	else ret = castFloat(value);

	return ret;
}

/*==================================
		DOM 操作
==================================*/
/**
 * メイン画面初期化処理
 * 初期DOM構築 事前計算 等
 * @param {*} callback コールバック
 */
function initialize(callback) {
	let text = '';

	// カテゴリのプリロード
	for (let i = 0; i < ITEM_ICON_TYPE.length; i++) {
		const id = ITEM_ICON_TYPE[i].id;
		const img = new Image();
		img.src = '../img/type/icon' + id + '.png';
		IMAGES["type" + id] = img;
	}

	// 手動設定敵艦情報でマスタを書き換える
	let manualEnemies = loadLocalStorage('manual_enemies');
	if (manualEnemies) {
		manualEnemies = manualEnemies.filter(v => UNKNOWN_ENEMY.includes(v.id));
		saveLocalStorage('manual_enemies', manualEnemies);
		for (const enemy of manualEnemies) {
			if (UNKNOWN_ENEMY.includes(enemy.id)) {
				const index = ENEMY_DATA.findIndex(v => v.id === enemy.id);
				ENEMY_DATA[index] = enemy;
			}
		}
	}

	// 保留リスト復帰
	reserveList = loadSessionStorage('reserve_list');
	if (!reserveList) {
		reserveList = [];
	}

	// 装備一覧データソース初期化
	updateItemList();

	// 機体カテゴリ初期化
	setPlaneTypeIconSelect(document.getElementById('plane_type_select'));

	$('#plane_filter_key_select').val('radius');
	$('#plane_filter_value').val(0);

	// 艦種初期化
	setShipType();
	// 敵艦種初期化
	setEnemyType(ENEMY_TYPE.filter(v => v.id > 0).map(v => v.id));

	// 最終状態のみ表示
	document.getElementById('display_final')['checked'] = setting.visibleFinal;
	document.getElementById('frequent_ship')['checked'] = setting.orderByFrequency;

	// 味方艦隊複製 ※ ここ以外について、shipNo_は順番は不問
	text = $('#shipNo_1').html();
	$('.ship_tab').each((i, e) => { if (i > 0) $(e).html(text); });

	// 敵艦隊欄複製
	text = $('#battle_container').html();
	for (let index = 1; index < 10; index++) $('#battle_container').append(text);
	$('.battle_content').each((i, e) => {
		$(e).find('.battle_no').text(i + 1);
		if (i > 0) $(e).addClass('d-none');
	});

	// 戦闘回数初期化
	$('#battle_count').val(1);

	// 結果欄チェック初期化
	$('#display_bar').prop('checked', true);
	$('#display_land_base_result').prop('checked', true);
	$('#display_fleet_result').prop('checked', true);
	$('#display_enemy_table').prop('checked', true);

	// 熟練度非活性
	$('.remodel_select').prop('disabled', true);

	// 結果表示バー複製
	$('.progress_area').html($('.progress_area:first').html());
	$('.progress_area').each((i, e) => {
		$(e).find('.result_bar').attr('id', 'result_bar_' + (i + 1));
		if (i < 6) $(e).find('.progress_label').text(`基地${(Math.floor(i / 2) + 1)} ${((i % 2) + 1)}波目`);
		if (i === 6) $(e).find('.progress_label').text('本隊');
		if (i === 7) $(e).find('.progress_label').text('防空');
	});

	// 撃墜テーブルヘッダフッタ10戦分生成
	text = '';
	let text1 = '';
	let text2 = '';
	let text3 = '';
	for (let index = 1; index <= 10; index++) {
		text += `<td class="td_battle battle${index}">${index}戦目</td>`;
		text1 += `<td class="td_battle battle${index} fap"></td>`;
		text2 += `<td class="td_battle battle${index} eap"></td>`;
		text3 += `<td class="td_battle battle${index} cond"></td>`;
	}
	$('#shoot_down_table').find('.tr_header').append(text + '<td class="td_battle battle_end">出撃後</td><td class="td_battle battle_death">全滅率</td>');
	$('.tr_fap').append(text1 + '<td class="td_battle battle_end fap font_size_11" colspan="2"></td>');
	$('.tr_eap').append(text2 + '<td class="td_battle battle_end eap" rowspan="2" colspan="2"></td>');
	$('.tr_cond').append(text3);

	// 戦闘結果表示タブ10戦分生成
	text = '';
	for (let index = 1; index <= 10; index++) {
		text += `
			<li class="nav-item ${index === 1 ? '' : 'd-none'}">
				<a class="nav-link ${mainColor === '#000000' ? '' : 'nav-link-dark'} ${index === 1 ? 'active' : ''}" data-toggle="tab" data-disp="${index}" href="#">${index}戦目</a>
			</li>`;
	}
	$('#display_battle_tab').html(text);

	// 制空状態割合テーブル複製
	text = $('#rate_table').find('thead').html();
	for (let index = 0; index <= 7; index++) $('#rate_table tbody').append(text);
	$('#rate_table tbody').find('tr').each((i, e) => {
		const lb_num = Math.floor(i / 2) + 1;
		const wave = i % 2 + 1;
		$(e).attr('id', 'rate_row_' + (i + 1));
		if (i < 6) {
			// 基地部分
			$(e).find('.rate_td_name').html(`<span class="mr-1">基地${lb_num}</span><span class="text-nowrap">${wave}波目</span>`);
			$(e)[0].dataset.base_no = lb_num - 1;
			$(e).addClass('cur_pointer land_base_detail');
		}
		else if (i === 6) $(e).find('.rate_td_name').text('本隊');
		else if (i === 7) $(e).find('.rate_td_name').text('防空');

		if (i % 2 === 0) $(e).addClass('rate_tr_border_top');
		else if (i >= 6) $(e).addClass('rate_tr_border_top rate_tr_border_bottom');
	});

	// 詳細設定 初期熟練度欄複製
	text = $('#init_prof_parent').html();
	// 機体 陸偵は除外
	const types = ITEM_API_TYPE.filter(v => PLANE_TYPE.includes(v.id) && v.id !== 49);
	for (const type of types) {
		$('#init_prof_parent').append(text);
		const $last = $('#init_prof_parent').find('.type_name:last');
		$last.text(type.name);
		$last.closest('.init_prof')[0].dataset.typeid = type.id;
	}
	$('#init_prof_parent').find('.init_prof:first').remove();

	for (const v of setting.defaultProf) {
		proficiency_Changed($(`.init_prof[data-typeid="${v.id}"`).find('.prof_opt[data-prof="' + v.prof + '"]').parent(), true);
	}

	// コンテンツ順序復帰
	if (setting.contentsOrder.length) {
		const $main = $('#main');
		// いったん退避し削除
		const ids = [];
		let appendedIds = [];
		const contents = [];
		const $main_header = $('#main_header_info');
		const $footer = $('#footer_info');
		$main.find('.contents').each((i, e) => {
			ids.push($(e).attr('id'));
			contents.push($(e))
		});
		$main.empty();
		$main.append($main_header);

		// でてきたid順にアペンド
		for (const id of setting.contentsOrder) {
			if (ids.includes(id)) {
				const $content = contents.find($e => $e.attr('id') === id);
				$main.append($content);

				// 挿入されたidは消化
				appendedIds.push(id);
			}
		}

		$main.append($footer);
		// 挿入されていないコンテンツを拾い、setting.contentsOrderを修正
		if (ids.length !== appendedIds.length) {
			for (const id of ids) {
				if (!appendedIds.includes(id)) {
					const $content = contents.find($e => $e.attr('id') === id);
					$main.append($content);

					appendedIds.push(id);
				}
			}
			setting.contentsOrder = appendedIds.concat();
			saveSetting();
		}
	}

	$('#stage2_detail_slot').val(18);
	$('#stage2_detail_avoid').val(0);

	// シミュレート回数
	if (setting.simulateCount) $('#calculate_count').val(setting.simulateCount);
	else $('#calculate_count').val(5000);

	// 内部熟練度120
	if (setting.initialProf120) {
		initialProf120Plane = setting.initialProf120;
	}
	for (const type of initialProf120Plane) {
		$(`#prof120_${type}`).prop('checked', true);
	}

	// 表示形式(一列/複数列)
	if (setting.displayMode) {
		Object.keys(setting.displayMode).forEach((key) => {
			$(`#${key} .toggle_display_type[data-mode="${setting.displayMode[key]}"]`).addClass('selected');
		});
	}
	else $('.toggle_display_type[data-mode="single"]').addClass('selected');

	// 連合艦隊チェック初期化
	$('#union_fleet').prop('checked', false);
	// 連合艦隊チェック初期化
	$('#yugeki_fleet').prop('checked', false);
	// 対空砲火ステ表示チェック初期化
	$('#visible_anti_air_status').prop('checked', setting.visibleAntiAirStatus);
	// クリップボード保存
	$('#clipboard_mode').prop('checked', setting.copyToClipboard);
	// 空スロット表示
	$('#empty_slot_invisible').prop('checked', setting.emptySlotInvisible);
	// お気に入りのみ表示
	$('#fav_only').prop('checked', setting.favoriteOnly);
	$('#fav_only_ship').prop('checked', setting.favoriteOnlyShip);
	// 在庫有のみ表示
	$('#disp_in_stock').prop('checked', setting.inStockOnly);
	$('#divide_stock').prop('checked', setting.isDivideStock);
	$('#disp_in_stock_ship').prop('checked', setting.inStockOnlyShip);
	// 配備済み表示
	$('#disp_equipped').prop('checked', setting.visibleEquipped);
	$('#disp_equipped_ship').prop('checked', setting.visibleEquippedShip);
	// 敵艦表示形式
	$('#enemy_display_image').prop('checked', setting.enemyDisplayImage);
	// 敵艦表示形式
	$('#enemy_display_text').prop('checked', !setting.enemyDisplayImage);
	// 敵艦表示形式 敵艦隊欄
	$('#enemy_fleet_display_image').prop('checked', setting.enemyFleetDisplayImage);
	// 敵艦表示形式 敵艦隊欄
	$('#enemy_fleet_display_text').prop('checked', !setting.enemyFleetDisplayImage);
	// マップ難易度初期化
	$('#select_difficulty').val(4);
	$('#plane_word').val('');
	$('#ship_word').val('');
	$('#enemy_word').val('');
	$('#stock_word').val('');

	// 基地欄タブ化するかどうか
	if ($('#lb_tab_select').css('display') !== 'none' && !$('#lb_item1').attr('class').includes('tab-pane')) {
		$('.lb_tab').addClass('tab-pane fade');
		$('.baseNo').removeClass('cur_move sortable_handle');
		$('.lb_tab:first').addClass('show active');
		$('#lb_item1').addClass('active');
	}

	if (setting.visibleFixedMenu) {
		$('#footer_menu').collapse('show');
		fixedMenuShown();
	}

	// tooltip起動
	$('[data-toggle="tooltip"]').tooltip();

	// グラフグローバル解除
	Chart.plugins.unregister(ChartDataLabels);

	callback();
}

/**
 * 2要素を入れ替えるようなアニメーションを発生させる
 * callback内で実入れ替え処理をいれること
 * @param {HTMLElement} insertNode
 * @param {HTMLElement} targetNode
 * @param {*} callback
 * @param {number} [duration=300]
 */
function TradeHTMLWithAnimation(insertNode, targetNode, callback, duration = 300) {

	if (isCtrlPress) {
		callback();
		return;
	}
	const orgDuration = insertNode.style.transitionDuration;
	insertNode.style.transitionDuration = duration + 'ms';
	targetNode.style.transitionDuration = duration + 'ms';
	// 挿入先X差分　正なら右に移動
	const diffX = targetNode.offsetLeft - insertNode.offsetLeft;
	// 挿入先Y差分 正なら下に移動
	const diffY = targetNode.offsetTop - insertNode.offsetTop;

	// 見かけの移動を行う
	insertNode.style.transform = `translate(${diffX}px, ${diffY}px)`;
	targetNode.style.transform = `translate(${-diffX}px, ${-diffY}px)`;

	setTimeout(function () {
		insertNode.style.transitionDuration = orgDuration;
		targetNode.style.transitionDuration = orgDuration;
		insertNode.style.transform = "";
		targetNode.style.transform = "";

		callback();
	}, duration);
}

/**
 * 機体カテゴリタブを生成
 * @param {HTMLElement} element 設置する対象の ul
 * @param {number[]} array 展開する機体カテゴリid配列
 */
function setPlaneTypeIconSelect(element, withoutAll = false) {
	if (withoutAll) element.innerHTML = '';
	else {
		element.innerHTML = `
		<div class="general_tr item_type active p-2" data-type="0">
			<img src="../img/type/all.png" class="img-size-32" alt="全て">
		</div>`;
	}

	const fragment = document.createDocumentFragment();

	// ここは装備カテゴリとしての選択域なので、ICON_TYPEから抽出
	const types = [6, 7, 8, 9, 57, 10, 45, 41, 1, 2, 3, 4, 5, 12, 14, 21, 24, 47, 48, 49, 17];
	for (const typeId of types) {
		const v = ITEM_API_TYPE.find(v => v.id === typeId);
		const div = document.createElement('div');
		div.className = 'general_tr item_type p-2';
		div.dataset.type = v.id;

		let altText = v.name;
		switch (typeId) {
			case 10:
				altText = '水上偵察機 / 水上爆撃機';
				break;
			case 12:
				altText = '電探';
				break;
			case 14:
				altText = '対潜装備';
				break;
			case 24:
				altText = '輸送 / 上陸用兵装';
				break;
			case 48:
				altText = '局地戦闘機 / 陸軍戦闘機';
				break;
			case 17:
				altText = 'その他';
				break;
			default:
				break;
		}

		const img = document.createElement('img');
		img.classList = 'img-size-32';
		// ここは装備カテゴリとしての選択域なので、itypeは使わない
		img.src = `../img/type/type${v.id}.png`;
		img.alt = altText;

		div.appendChild(img);
		fragment.appendChild(div);
	}

	element.appendChild(fragment);
}

/**
 * 遊撃部隊にチェックが入っていたら7を返すそれ以外6を返すだけのメソッド
 */
function getMaxShipCount() {
	if ($('#yugeki_fleet').prop('checked')) return 7;
	return 6;
}

/**
 * 艦種selectタグに、第1引数配列からoptionタグを生成
 */
function setShipType() {
	const fragment = document.createDocumentFragment();
	for (const v of SHIP_TYPE) {
		// 小さい画面用
		const div = document.createElement('div');
		div.className = 'general_tr ship_type p-2 d-lg-none';
		div.dataset.type = v.id;
		div.textContent = v.name;
		fragment.appendChild(div);
	}

	// 上記と比べて正規空母 軽空母 航空戦艦 航巡 水母を追加したやつ(大画面用)
	for (const v of SHIP_TYPE_RE) {
		const div = document.createElement('div');
		div.className = 'general_tr ship_type p-2 d-none d-lg-block';
		div.dataset.type = v.id;
		div.textContent = v.name;
		fragment.appendChild(div);
	}

	document.getElementById('ship_type_select').appendChild(fragment);
}

/**
 * 敵艦種selectタグに、第二引数配列からoptionタグを生成
 * @param {number[]} array 展開する艦種id配列
 */
function setEnemyType(array) {
	const parent1 = document.getElementById('enemy_type_select');
	const parent2 = document.getElementById('manual_enemy_type');
	for (const v of ENEMY_TYPE) {
		if (array.includes(v.id)) {
			const opt = document.createElement('option');
			opt.value = v.id;
			opt.textContent = v.name;
			parent1.appendChild(opt.cloneNode(true));

			const opt2 = document.createElement('option');
			opt2.value = v.id;
			opt2.textContent = v.name;
			parent2.appendChild(opt.cloneNode(true));
		}
	}
	parent1.options[2].selected = true;

	parent1.options[0].selected = true;
	const type = castInt(document.getElementById('manual_enemy_type').value);
	const parent = document.getElementById('manual_enemy_id');
	const enemies = ENEMY_DATA.filter(v => v.type.includes(type));
	for (const enemy of enemies) {
		const opt = document.createElement('option');
		opt.value = enemy.id;
		opt.textContent = `id: ${enemy.id + 1500} ${enemy.name}`;
		parent.appendChild(opt);
	}
	parent.options[0].selected = true;
}

/**
 * 引数で渡された .xx_plane 内艦載機データをクリアする
 * @param {JQuery} $div クリアする .lb_plane .ship_plane
 */
function clearPlaneDiv($div) {
	// 選択状況をリセット
	$div.removeClass(getItemCss($div[0].dataset.type));
	$div[0].dataset.planeid = '';
	$div[0].dataset.type = '';
	$div.find('.plane_img').attr('src', '../img/type/undefined.png').attr('alt', '');
	$div.find('.plane_name_span').text('装備を選択');
	$div.find('.remodel_select').prop('disabled', true).addClass('remodel_disabled zero');
	$div.find('.remodel_value').text(0);
	$div.find('.btn_remove_plane').addClass('opacity0');
	$div.find('.item_special').addClass('d-none');

	if ($div.hasClass('expanded_slot')) {
		$div.find('.plane_name_span').text('補強増設');
	}
	const $profSelect = $div.find('.prof_select');
	$profSelect.attr('src', '../img/util/prof0.png').attr('alt', '');
	$profSelect[0].dataset.prof = 0;
}
/**
 * 引数で渡された要素内の艦載機を全てクリアする
 * @param {JQuery} $div クリア対象 .contents または #landBase #friendFleet
 */
function clearPlaneDivAll($div) {
	if ($div.attr('id') === 'landBase') {
		$('.lb_plane').each((i, e) => setLBPlaneDiv($(e)));
		$('#modal_collectively_setting').modal('hide');
	}
	else if ($div.attr('id') === 'friendFleet') {
		$('.ship_plane').each((i, e) => clearPlaneDiv($(e)));
	}
}

/**
 * 第1引数で渡された lb_plane要素 に対し第2引数の機体オブジェクト（{id, prof, slot, remodel} 指定）を挿入する
 * @param {JQuery} $div 挿入先
 * @param {Object} lbPlane 機体データオブジェクト データがない場合はClear処理として動作
 */
function setLBPlaneDiv($div, lbPlane = { id: 0, slot: 0, remodel: 0 }) {
	const id = castInt(lbPlane.id);
	const plane = ITEM_DATA.find(v => v.id === id);
	const result = setPlaneDiv($div, lbPlane);
	if (!lbPlane.hasOwnProperty('slot')) lbPlane.slot = 0;

	// 搭載数最大値　基本は18
	let maxSlot = 18;
	if (result && plane) {
		if (RECONNAISSANCES.includes(plane.type)) maxSlot = 4;
		else if (plane.type === 53) maxSlot = 9;
	}
	$div.find('.slot_input').attr('max', maxSlot);
	$div.find('.slot_range').attr('max', maxSlot);

	let initSlot = lbPlane.slot;
	if (initSlot === 0 || initSlot > maxSlot) initSlot = maxSlot;
	if (!result) initSlot = 0;

	$div.find('.slot').text(initSlot);
}

/**
 * 第1引数で渡された xx_plane に第2引数の機体オブジェクト（{id, remodel, prof} 指定）を搭載する
 * @param {JQuery} $div xx_planeを指定。xxは現状 ship または lb
 * @param {Object} inputPlane 機体オブジェクト（{id, remodel, prof} 指定）
 * @param {boolean} canEditSlot 搭載数の変更を許可するかどうか
 * @returns {boolean} 搭載が成功したかどうか
 */
function setPlaneDiv($div, inputPlane = { id: 0, remodel: 0, prof: -1 }, canEditSlot = false) {
	// 機体じゃなさそうなモノが渡されたらとりあえずクリア
	if (!inputPlane.id) {
		clearPlaneDiv($div);
		return false;
	}

	// 渡された機体の基本データ取得
	const plane = ITEM_DATA.find(v => v.id === inputPlane.id);
	// 未定義の機体だった場合もクリア
	if (!plane) {
		clearPlaneDiv($div);
		return false;
	}

	// 渡された機体の不足プロパティセット
	if (!inputPlane.hasOwnProperty('remodel')) inputPlane.remodel = 0;
	if (!inputPlane.hasOwnProperty('prof')) inputPlane.prof = -1;

	if ($div.closest('.ship_tab').length > 0) {
		// 搭載先が艦娘の場合、機体が装備できるのかどうかチェック
		let shipId = castInt($div.closest('.ship_tab')[0].dataset.shipid);
		if (!checkInvalidItem(shipId, plane, castInt($div.index()))) {
			clearPlaneDiv($div);
			return false;
		}

		// 日進の大型飛行艇処理
		if (plane.type === 41 && (shipId === 1490 || shipId === 386)) {
			if (inputPlane.hasOwnProperty('slot')) inputPlane.slot = 1;
			else inputPlane["slot"] = 1;
			canEditSlot = true;
		}
	}

	$div.removeClass(getItemCss($div[0].dataset.type)).addClass(getItemCss(plane.itype));
	$div[0].dataset.planeid = plane.id;
	$div[0].dataset.type = plane.itype;
	$div[0].dataset.type2 = plane.type;
	$div.find('.plane_name_span').text(plane.name).attr('title', plane.name);
	$div.find('.plane_img').attr('src', `../img/type/icon${plane.itype}.png`).attr('alt', plane.itype);
	$div.find('.btn_remove_plane').removeClass('opacity0');

	// 改修の有効無効設定
	const $remodelInput = $div.find('.remodel_select');
	$remodelInput.prop('disabled', false);
	if (!plane.canRemodel) {
		// 改修無効の機体
		$remodelInput.addClass('remodel_disabled');
	}
	else {
		// 改修値セット 基本は0
		$remodelInput.removeClass('remodel_disabled');
	}

	const putRemodel = Math.min(inputPlane.remodel, 10);
	if (!putRemodel) {
		$remodelInput.addClass('zero');
	}
	else {
		$remodelInput.removeClass('zero');
	}
	$remodelInput.find('.remodel_value').text(putRemodel);

	// 特効表示
	const $specialDiv = $div.find('.item_special');
	$specialDiv.addClass('d-none');
	if (specialOperator.enabled) {
		for (const info of specialOperator.specialInfo) {
			if (info.items.includes(plane.id)) {
				$specialDiv.removeClass('d-none');
				$specialDiv.html(`${info.name}<span class="font_size_12">${info.remarks}</span>`);
				break;
			}
		}
	}

	// 熟練度初期値 陸偵熟練は||
	let prof = 0;
	// デフォルト熟練度
	const tmpDefault = setting.defaultProf.find(v => v.id === plane.type);
	// 設定値が見つかればそれ
	if (tmpDefault) {
		prof = tmpDefault.prof;
	}
	// 陸偵熟練は2固定
	if (plane.id === 312) {
		prof = 2;
	}
	// 特定熟練度を保持していた場合はそちら優先
	if (inputPlane.prof >= 0) {
		prof = inputPlane.prof;
	}
	const $prof_select = $div.find('.prof_select');
	$prof_select.attr('src', `../img/util/prof${prof}.png`);
	$prof_select[0].dataset.prof = prof;

	// 搭載数を変更する
	if (canEditSlot) {
		if (!inputPlane.hasOwnProperty('slot')) inputPlane.slot = 0;
		$div.find('.slot').text(inputPlane.slot);
	}

	// 搭載成功
	return true;
}

/**
 * 第1引数で渡された .ship_tab に第2引数で渡された 艦娘データを挿入する
 * @param {JQuery} $div 艦娘タブ (.ship_tab)
 * @param {number} id 艦娘id
 * @param {number} [level=99] 練度 デフォルト99
 * @param {number} [area=0] 出撃海域 デフォ0
 * @param {number} [luck=0] 運 デフォ0
 */
function setShipDiv($div, id, level = 99, area = 0, luck = 0) {
	const ship = SHIP_DATA.find(v => v.id === id);
	if (!ship) return;
	$div[0].dataset.shipid = ship.id;
	$div[0].dataset.shiptype = ship.type;
	$div[0].dataset.shiptype2 = ship.type2;
	$div.find('.ship_img').attr('src', `../img/ship/${id}.png`);
	if (area > 0 && area <= MAX_AREA) {
		$div.find('.ship_area_img').attr('src', `../img/util/area${area}.png`);
		$div.find('.ship_area_img').removeClass('d-none');
		// 海域
		$div.find('.area').text(area);
	}
	else {
		$div.find('.ship_area_img').addClass('d-none');
		$div.find('.area').text(-1);
	}
	$div.find('.sortable_handle').removeClass('d-none');
	$div.find('.ship_name_span').text(ship.name);
	$div.find('.ship_plane').each((i, e) => {
		const $this = $(e);
		const plane = {
			id: castInt($this[0].dataset.planeid),
			remodel: castInt($this.find('.remodel_value').text()),
			prof: castInt($this.find('.prof_select')[0].dataset.prof),
		};
		// 既に装備されている装備を装備しなおそうとする -> 不適切なら自動的にはずれる
		if ($div[0].dataset.shipid) setPlaneDiv($this, plane);

		if (i < ship.slot.length) {
			$this.removeClass('d-none').addClass('d-flex');
			$this.find('.slot').text(ship.slot[i]);
			$this.find('.slot_select_parent').data('ini', ship.slot[i]);
		}
		else {
			clearPlaneDiv($this);
			$this.removeClass('d-flex').addClass('d-none');
			$this.find('.slot').text(0);
			$this.find('.slot_select_parent').data('ini', 0);
		}
	});
	// 練度
	$div.find('.ship_level').text(level);
	// 補強増設表示
	$div.find('.expanded_slot').removeClass('d-none');
	// 素対空値
	$div.find('.aa').text(ship.max_aa);
	// 素索敵値 分からないなら-1
	if (ship.max_scout > 0) {
		$div.find('.max_scout').text(ship.max_scout);
		$div.find('.min_scout').text(ship.scout);
	}
	else {
		// 索敵値不明
		$div.find('.max_scout').text(-1);
		$div.find('.min_scout').text(-1);
	}
	$div.find('.scout').text(0);
	// 運
	if (luck > 0) {
		$div.find('.ship_luck').text(luck);
	}
	else {
		$div.find('.ship_luck').text(ship.luck);
	}
	// 噴進弾幕の表示可否
	if ([6, 7, 10, 11, 16, 18].includes(ship.type)) {
		$div.find('.hunshin').removeClass('disabled');
	}
	else {
		$div.find('.hunshin').addClass('disabled');
	}

	$div.removeClass('no_ship');
}

/**
 * 指定した ship_tab をクリアする
 * @param {JQuery} $div クリアする .ship_tab
 */
function clearShipDiv($div) {
	// 選択状況をリセット
	$div[0].dataset.shipid = '';
	$div[0].dataset.shiptype = '';
	$div[0].dataset.shiptype2 = '';
	$div.find('.sortable_handle').addClass('d-none');
	$div.find('.ship_img').attr('src', '../img/ship/0.png');
	$div.find('.ship_name_span').text('艦娘を選択');
	$div.find('.ship_plane').each((i, e) => {
		const $this = $(e);
		clearPlaneDiv($this);
		$this.find('.slot').text(0);
		$this.find('.slot_input').attr('max', 99);
		$this.find('.slot_range').attr('max', 99);
		if (i < 4) $this.removeClass('d-none').addClass('d-flex');
		else $this.removeClass('d-flex').addClass('d-none');
	});
	// 素対空値
	$div.find('.aa').text(0);
	// 素索敵値
	$div.find('.scout').text(0);
	// 運
	$div.find('.ship_luck').text(0);
	// スロットは全ていったんロック解除
	$div.find('.plane_lock').addClass('d-none');
	// 実際はremoveClassだが機能凍結に際しaddClassに変更
	$div.find('.plane_unlock').addClass('d-none');
	// 練度
	$div.find('.ship_level').text(99);
	// 噴進弾幕
	$div.find('.hunshin').addClass('d-none');
	$div.addClass('no_ship');
}

/**
 * 艦娘を全て解除する。表示隻数も変更する
 * @param {number} displayCount 表示隻数　デフォルト2
 */
function clearShipDivAll(displayCount = 2) {
	$('.ship_tab').each((i, e) => clearShipDiv($(e)));
	display_ship_count_Changed($('#friendFleet_item1'), displayCount, true);
	display_ship_count_Changed($('#friendFleet_item2'), displayCount, true);
}

/**
 * 第1引数で渡された .enemy_content に第2引数で渡されたidの敵艦データを挿入する
 * @param {JQuery} $div 敵艦タブ (enemy_content)
 * @param {number} id 敵艦id
 * @param {number} ap 直接入力時指定(id === -1時)
 */
function setEnemyDiv($div, id, ap = 0) {
	if (!$div) return;
	const enemy = new Enemy(id);
	const displayText = !setting.enemyFleetDisplayImage;

	// 空の敵艦が帰ってきたら中止
	if (enemy.id === 0) return;

	$div[0].dataset.enemyid = enemy.id;
	$div.removeClass('d-none no_enemy is_dead').addClass('d-flex');
	$div.find('.enemy_name_text').html(drawEnemyGradeColor(enemy.name));
	$div.find('.enemy_name_img').attr('src', `../img/enemy/${enemy.id}.png`);

	if (displayText) {
		$div.addClass('py-0_5').removeClass('pb-0_1 min-h-31px');
		$div.find('.enemy_name_img_parent').addClass('d-none').removeClass('d-flex');
		$div.find('.enemy_name_text').removeClass('d-none');
	}
	else {
		$div.removeClass('py-0_5').addClass('pb-0_1 min-h-31px');
		$div.find('.enemy_name_img_parent').addClass('d-flex').removeClass('d-none');
		$div.find('.enemy_name_text').addClass('d-none');
	}

	let displayAp = 0;
	if (id === -1 && ap > 0) displayAp = ap;
	else if (enemy.airPower > 0) displayAp = enemy.airPower;
	else if (enemy.landBaseAirPower > 0) displayAp = `(${enemy.landBaseAirPower})`;
	$div.find('.enemy_ap').text(displayAp);
}

/**
 * 指定した enemy_content をクリアする
 * @param {JQuery} $div クリアする .enemy_content
 */
function clearEnemyDiv($div) {
	$div[0].dataset.enemyid = 0;
	$div.addClass('no_enemy');
	$div.addClass('py-0_5').removeClass('pb-0_1 min-h-31px is_dead');
	$div.find('.enemy_name_img_parent').addClass('d-none').removeClass('d-flex');
	$div.find('.enemy_name_img').attr('src', `../img/enemy/-1.png`);
	$div.find('.enemy_name_text').removeClass('d-none');
	$div.find('.enemy_name_text').text('敵艦を選択');
	$div.find('.enemy_ap').text(0);
}

/**
 * 全敵艦解除 戦闘数も変更(指定可能 デフォルト1)
 * @param {number} count 初期戦闘数 デフォルト1
 */
function clearEnemyDivAll(count = 1) {
	$('.battle_content').each((i, e) => {
		$(e)[0].dataset.celldata = '';
		$(e).find('.enemy_content').each((i, e) => clearEnemyDiv($(e)));
	});
	$('#battle_count').val(count);
	createEnemyInput(count);

	clearEnemyDiv($('#air_raid_enemies').find('.enemy_content'));
}

/**
 * 値が増加した場合緑に、減少した場合赤に、色を変えつつ値を変更する
 * @param {Element} node
 * @param {number} pre 変更前の値
 * @param {number} cur 変更後の値
 * @param {boolean} reverse 赤緑判定を反転する場合 true を指定
 */
function drawChangeValue(node, pre, cur, reverse = false) {
	if (castInt(pre) !== castInt(cur)) {
		const $inline = $(node);
		$inline.text(cur).stop();
		if (reverse) $inline.css('color', cur < pre ? '#0c5' : cur > pre ? '#f00' : mainColor);
		else $inline.css('color', cur > pre ? '#0c5' : cur < pre ? '#f00' : mainColor);
		$inline.delay(500).animate({ 'color': mainColor }, 1000);
	}
	else $(node).css('color', mainColor);
}

/**
 * 渡された敵艦名にflagshipやelite文字が含まれていれば色を塗ったspanのHtmlTextとして返却
 * @param {string} enemyName
 * @returns {string} 色付き敵艦名
 */
function drawEnemyGradeColor(enemyName) {
	if (enemyName.includes('elite')) {
		enemyName = enemyName.replace('elite', '<span class="text-danger">elite</span>');
	}
	else if (enemyName.includes('改flagship')) {
		enemyName = enemyName.replace('flagship', '<span class="text-primary">flagship</span>');
	}
	else if (enemyName.includes('flagship')) {
		enemyName = enemyName.replace('flagship', '<span class="text-warning">flagship</span>');
	}
	return enemyName;
}

/**
 * 機体一覧に plans 配列から値を展開
 * @param {ItemDetail[]} items
 * @param {number} type 表示カテゴリ この値によって表示するステを変える
 */
function createItemTable(items, type) {
	const $modal = $('#modal_plane_select').find('.modal-dialog');
	const $tbody = $('#plane_tbody');
	const target = document.getElementById('plane_tbody');
	const fragment = document.createDocumentFragment();
	const imgWidth = 25;
	const imgHeight = 25;
	const displayMode = $modal.find('.toggle_display_type.selected').data('mode');
	const planeStock = loadPlaneStock();
	const dispInStock = setting.inStockOnly;
	const isDivideStock = setting.isDivideStock;
	const dispEquipped = setting.visibleEquipped;
	const favOnly = setting.favoriteOnly;
	const sortKey = $('#plane_sort_select').val();
	const usedTable = usedItems.concat();
	const dispSpecialOnly = document.getElementById('disp_special')['checked'];

	// ステータス表示を行うプロパティ名 カテゴリ、ソートキーによって可変
	let displayLabels = ['antiAir', 'antiAirWeight', 'antiAirBonus', 'fire', 'accuracy'];

	// 艦戦 水戦
	if (type === 6 || type === 45) displayLabels = ['antiAir', 'accuracy', 'fire', 'avoid2', 'scout'];
	// 艦攻
	else if (type === 8) displayLabels = ['torpedo', 'accuracy', 'antiAir', 'avoid', 'asw'];
	// 艦爆
	else if (type === 7 || type === 57) displayLabels = ['bomber', 'accuracy', 'antiAir', 'avoid', 'asw'];
	// 水爆
	else if (type === 10 || type === 11) displayLabels = ['bomber', 'scout', 'antiAir', 'avoid', 'accuracy'];
	// 偵察機系
	else if (RECONNAISSANCES.includes(type)) displayLabels = ['scout', 'radius', 'accuracy', 'antiAir', 'cost'];
	// 主砲 副砲
	else if ([1, 2, 3, 4].includes(type)) displayLabels = ['fire', 'accuracy', 'antiAir', 'antiAirWeight', 'antiAirBonus'];
	// 電探
	else if ([12, 13].includes(type)) displayLabels = ['antiAir', 'accuracy', 'antiAirWeight', 'antiAirBonus', 'scout'];
	// 対潜
	else if ([14, 15].includes(type)) displayLabels = ['asw', 'fire', 'accuracy', 'avoid2', 'armor'];
	// 魚雷
	else if ([5, 22, 32].includes(type)) displayLabels = ['torpedo', 'fire', 'accuracy', 'avoid2', 'armor'];
	// 機銃 / 高射装置
	else if (type === 21) displayLabels = ['antiAir', 'antiAirWeight', 'antiAirBonus', 'fire', 'torpedo'];
	// 陸攻系
	else if (LB_ATTACKERS.includes(type)) displayLabels = ['antiAir', 'radius', 'torpedo', 'avoid', 'cost'];
	// 局地戦闘機
	else if (type === 48) displayLabels = ['antiAir', 'radius', 'battleAntiAir', 'defenseAntiAir', 'cost'];

	// 基地機体選択中なら、第2、第5の表示は半径とコストに置換
	if ($target && !$target.hasClass('ship_plane')) {
		displayLabels[1] = 'radius';
		displayLabels[4] = 'cost';

		// 全体 基本
		if (type === 0) {
			displayLabels = ['antiAir', 'radius', 'battleAntiAir', 'cost', 'avoid'];
		}
	}


	// ステータスヘッダ調整
	let basic_index = 0;
	$('#plane_table_thead').find('.plane_td_basic').each((i, e) => {
		// 可変ヘッダーの書き換え
		$(e).text(convertHeaderText(displayLabels[basic_index]));
		$(e)[0].dataset.sortkey = displayLabels[basic_index++];

		if (sortKey === $(e)[0].dataset.sortkey) {
			$(e).addClass('active');
		}
		else {
			$(e).removeClass('active');
		}
	});

	if (displayMode === "multi") {
		$modal.addClass('modal-xl');
		$modal.removeClass('modal-lg');
		$tbody.addClass('multi_mode');
		$modal.find('.scroll_thead').addClass('d-none').removeClass('d-flex');
	}
	else {
		$modal.addClass('modal-lg');
		$modal.removeClass('modal-xl');
		$tbody.removeClass('multi_mode');
		$modal.find('.scroll_thead').addClass('d-flex').removeClass('d-none');
	}

	if (dispInStock) {
		$('#divide_stock').closest('div').removeClass('d-none');
		$('#disp_equipped').closest('div').removeClass('d-none');
		$('#disp_in_stock').prop('checked', true);
	}
	else {
		$('#divide_stock').closest('div').addClass('d-none');
		$('#disp_equipped').closest('div').addClass('d-none');
		$('#disp_in_stock').prop('checked', false);
	}

	const max_i = items.length;
	let prevType = 0;
	let maxRemodelLevel = 0;
	let enabledCount = -1;
	let stockNumber = 0;

	for (let i = 0; i < max_i; i++) {
		const item = items[i];

		// お気に入り機体のみ
		if (favOnly && !setting.favoritePlane.includes(item.id)) continue;

		// 在庫にあるもの表示にチェック
		if (dispInStock && planeStock) {
			// 使用済み機体 [id: , remodels: [1, 0, 1, ...]]
			const used = usedTable.find(v => v.id === item.id);

			// ★反映あり
			if (isDivideStock) {
				// 非在庫管理分(最低保証分=>stockが-1で登録されているデータ)は非表示
				if (item.stock === -1) continue;

				enabledCount = item.stock - (used ? used.num[item.remodel] : 0);
				if (!dispEquipped && enabledCount < 1) continue;
				// クリック時に搭載する改修値の設定
				maxRemodelLevel = item.remodel;
			}
			// ★反映なし => ステータス表示自体は改修0であるものとして表示 クリック時に最大値を持ってくる
			else {
				// 在庫管理分は非表示 => 改修なし最低保証分の表示だけで事足りるため
				if (item.stock >= 0) continue;

				const stock = planeStock.find(v => v.id === item.id);
				// 画面全体での使用済み数
				const usedNum = used ? getArraySum(used.num) : 0;
				// この装備の登録全体所持数
				stockNumber = stock ? getArraySum(stock.num) : 0;
				// 未所持 または 全て配備済みかつ配備済みは非表示 の場合表示しない
				if (stockNumber === 0 || (!dispEquipped && usedNum >= stockNumber)) continue;
				// 利用可能数
				enabledCount = stockNumber - usedNum;
				for (let j = 10; j >= 0; j--) {
					if (used) stock.num[j] -= used.num[j];
					if (stock.num[j] > 0) {
						maxRemodelLevel = j;
						break;
					}
				}
			}
		}
		else if (item.remodel > 0 || item.stock >= 0) {
			// 改修値0 所持数-1のデータのみ使う
			continue;
		}

		let planeDivClass = '';
		// 複数列表示とそれ以外とで小細工　微調整
		if (displayMode === 'multi') {
			planeDivClass = 'tr_multi px-1';
		}
		else {
			planeDivClass = 'px-2';
		}

		// ラップ
		const $planeDiv = document.createElement('div');
		$planeDiv.className = `plane plane_tr general_tr d-flex py-2 py-lg-1 ${planeDivClass}`;
		$planeDiv.dataset.planeid = item.id;
		$planeDiv.dataset.type = item.type;
		$planeDiv.dataset.remodel = maxRemodelLevel;
		if (dispInStock && dispEquipped && enabledCount <= 0) {
			$planeDiv.classList.remove('plane_tr', 'plane', 'general_tr');
			$planeDiv.classList.add('plane_tr_disabled');
		}

		// アイコン用ラッパー
		const $iconDiv = document.createElement('div');
		$iconDiv.className = 'align-self-center size-25 relative';

		// アイコン
		const cvs = document.createElement('canvas');
		const ctx = cvs.getContext('2d');
		cvs.width = imgWidth;
		cvs.height = imgHeight;
		ctx.drawImage(IMAGES['type' + item.itype], 0, 0, imgWidth, imgHeight);

		// 特効表示用
		if (specialOperator.enabled) {
			let isSpecial = false;
			for (const info of specialOperator.specialInfo) {
				if (info.items.includes(item.id)) {
					const $specialDiv = document.createElement('div');
					$specialDiv.className = 'item_special flash';
					$specialDiv.innerHTML = `${info.name}<span class="font_size_12">${info.remarks}</span>`;
					$iconDiv.appendChild($specialDiv);
					isSpecial = true;
					break;
				}
			}

			if (dispSpecialOnly && !isSpecial) {
				// 突然の死
				continue;
			}
		}

		// 機体名 + α ラッパー
		const nameWrapper = document.createElement('div');
		nameWrapper.className = 'pl-1 d-flex align-self-center flex-grow-1';

		// 色付けるやつ　特殊高角砲だったりロケット戦闘機だったり...
		let specialItem = false;
		if (item.itype === 16 && item.antiAir >= 8) {
			// 特殊高角砲
			specialItem = true;
		}
		else if (item.type === 21 && item.antiAir >= 9) {
			// 特殊機銃
			specialItem = true;
		}
		else if (item.id === 350 || item.id === 351 || item.id === 352) {
			// ロケ戦
			specialItem = true;
		}

		const $nameDiv = document.createElement('div');
		$nameDiv.className = `pl-1 plane_td_name align-self-center${specialItem ? ' special_item' : ''}`;
		$nameDiv.textContent = item.name;
		nameWrapper.appendChild($nameDiv);

		// 残り個数
		const $stockDiv = document.createElement('div');
		$stockDiv.className = 'ml-2 plane_td_stock align-self-center';
		$stockDiv.textContent = '×' + (enabledCount > 0 ? enabledCount : 0);

		// ステータス表示部分fragment
		const statusFragment = document.createDocumentFragment();
		// ステータス表示メイン1
		const status0 = document.createElement('div');
		status0.className = 'ml-auto plane_td_basic align-self-center';
		// ステータス表示メイン2
		const status1 = document.createElement('div');
		status1.className = 'plane_td_basic align-self-center';
		// ステータス表示サブ1 (画面表示小で消える)
		const status2 = document.createElement('div');
		status2.className = 'plane_td_basic align-self-center d-none d-lg-block';
		// ステータス表示サブ2 (画面表示小で消える)
		const status3 = document.createElement('div');
		status3.className = 'plane_td_basic align-self-center d-none d-lg-block';
		// ステータス表示サブ3 (画面表示小で消える)
		const status4 = document.createElement('div');
		status4.className = 'plane_td_basic align-self-center d-none d-lg-block';

		status0.textContent = sFormat(item[displayLabels[0]], displayLabels[0]);
		status1.textContent = sFormat(item[displayLabels[1]], displayLabels[1]);
		status2.textContent = sFormat(item[displayLabels[2]], displayLabels[2]);
		status3.textContent = sFormat(item[displayLabels[3]], displayLabels[3]);
		status4.textContent = sFormat(item[displayLabels[4]], displayLabels[4]);

		// 複数表示時分割
		if (displayMode === 'multi' && prevType !== item.type && sortKey === 'default') {
			const $typeDiv = document.createElement('div');
			$typeDiv.className = 'type_divider mt-3 mb-1';

			const $type = document.createElement('div');
			$type.className = 'font_size_12 font_color_half align-self-center';
			$type.textContent = ITEM_API_TYPE.find(v => v.id === item.type).name;

			const $typeLine = document.createElement('div');
			$typeLine.className = 'flex-grow-1 border-bottom align-self-center mx-2';

			$typeDiv.appendChild($type);
			$typeDiv.appendChild($typeLine);

			fragment.appendChild($typeDiv);
		}

		$iconDiv.appendChild(cvs);
		$planeDiv.appendChild($iconDiv);

		if (isDivideStock && item.remodel > 0) {
			// 改修値
			const $remodelDiv = document.createElement('div');
			$remodelDiv.className = 'plane_td_remodel text_remodel align-self-center';
			$remodelDiv.dataset.remodel = item.remodel;
			let remodelText = '';
			if (displayMode === 'multi') {
				remodelText = '★' + item.remodel;
			}
			else {
				remodelText = item.remodel < 10 ? '★+' + item.remodel : '★MAX';
			}
			$remodelDiv.textContent = remodelText;
			nameWrapper.appendChild($remodelDiv);
			nameWrapper.appendChild($stockDiv);
		}

		// 所持数突っ込む
		if (enabledCount > 0) {
			nameWrapper.appendChild($stockDiv);
		}

		$planeDiv.appendChild(nameWrapper);

		// 表示モード一列ならステータス表示欄を付与
		if (displayMode === 'single') {
			statusFragment.appendChild(status0);
			statusFragment.appendChild(status1);
			statusFragment.appendChild(status2);
			statusFragment.appendChild(status3);
			statusFragment.appendChild(status4);
			$planeDiv.appendChild(statusFragment);
		}

		fragment.appendChild($planeDiv);
		prevType = item.type;
	}

	if (!fragment.childNodes.length) {
		const none = document.createElement('div');
		none.className = 'text-center';
		if (dispInStock && !dispEquipped) {
			none.textContent += '装備所持数が登録されていないか、全ての装備が配備済みです。';
		}
		if (dispInStock && !dispEquipped) {
			none.textContent += '装備所持数が登録されていないか、全ての装備が配備済みです。';
		}
	}

	target.innerHTML = '';
	target.appendChild(fragment);
}

/**
 * 艦娘一覧テーブル構築
 */
function createShipTable() {
	const modal = document.getElementById('modal_ship_select').getElementsByClassName('modal-dialog')[0];
	const tbody = document.getElementById('ship_tbody');
	const displayMode = modal.querySelector('.toggle_display_type.selected').dataset.mode;
	const visibleFinal = document.getElementById('display_final')['checked'];
	const searchWord = document.getElementById('ship_word').value.trim();
	const isFrequent = document.getElementById('frequent_ship')['checked'];
	const dispInStock = document.getElementById('disp_in_stock_ship')['checked'];
	const dispEquipped = document.getElementById('disp_equipped_ship')['checked'];
	const dispDaihatsu = document.getElementById('disp_daihatsu_ship')['checked'];
	const dispKamisha = document.getElementById('disp_kamisha_ship')['checked'];
	const dispSlotEx = document.getElementById('disp_slot_ex_ship')['checked'];
	const favOnly = document.getElementById('fav_only_ship')['checked'];
	const shipStock = loadShipStock();
	let type = 0;

	const $selectedType = $('#ship_type_select .ship_type.active');
	if ($selectedType.length) {
		type = castInt($selectedType[0].dataset.type);
	}
	else {
		// 選択艦種が存在しなかったら空母系を出す　その後選択してくれい
		type = 111;
	}

	// 艦種拡張
	let dispType = [];
	switch (type) {
		case 103:
			// 軽巡級
			dispType = [3, 4];
			break;
		case 105:
			// 重巡級
			dispType = [5, 6];
			break;
		case 108:
			//戦艦級
			dispType = [8, 9, 10];
			break;
		case 111:
			// 航空母艦
			dispType = [7, 11, 18];
			break;
		case 114:
			// 潜水艦
			dispType = [13, 14];
			break;
		case 116:
			// 補助艦艇
			dispType = [1, 16, 17, 19, 20, 21, 22];
			break;
		case 11:
			// 正規空母(大画面)
			dispType = [11, 18];
			break;
		case 8:
			// 戦艦(大画面)
			dispType = [8, 9];
			break;
		case 117:
			// 補助艦艇(大画面)
			dispType = [1, 17, 19, 20, 21, 22];
			break;
		default:
			dispType.push(type);
			break;
	}

	setting.visibleFinal = visibleFinal;
	setting.orderByFrequency = isFrequent;
	setting.inStockOnlyShip = dispInStock;
	setting.visibleEquippedShip = dispEquipped;
	setting.favoriteOnlyShip = favOnly;
	saveSetting();

	if (dispInStock) {
		$('#disp_equipped_ship').closest('div').removeClass('d-none');
		$('#disp_slot_ex_ship').closest('div').removeClass('d-none');
	}
	else {
		$('#disp_equipped_ship').closest('div').addClass('d-none');
		$('#disp_slot_ex_ship').closest('div').addClass('d-none');
	}

	// 指定艦種の艦娘を取得 検索文字列があれば最優先。最終改造状態もここで絞る
	let ships = SHIP_DATA.filter(v => {
		if (searchWord) return v.id == searchWord || v.name.includes(searchWord);
		return dispType.includes(v.type) && (visibleFinal ? v.final > 0 : true)
	});

	// お気に入りにないものは削除
	if (favOnly) {
		const favorites = setting.favoriteShip;
		ships = ships.filter(v => favorites.includes(v.id));
	}

	// 所持数モード　複数いるなら所持艦娘情報のステータスを付与して増殖
	if (dispInStock) {
		for (const stock of shipStock) {

			// 増設条件
			const details = dispSlotEx ? stock.details.filter(v => (v.ex === 1 || v.ex === -1)) : stock.details;

			if (details.length <= 0) {
				// 明細行がないならshipsから除去して次
				ships = ships.filter(v => v.id !== stock.id);
				continue;
			}

			details.sort((a, b) => { return a.lv - b.lv });
			const index = ships.findIndex(v => v.id === stock.id);
			// 保険
			if (index < 0) continue;

			const baseShip = ships[index];
			const baseLv = details[0].lv;
			const baseUpLuck = details[0].st[4];
			const baseArea = details[0].area <= MAX_AREA && details[0].area > 0 ? details[0].area : -1;

			baseShip.lv = baseLv;
			baseShip.area = baseArea;
			baseShip.upLuck = baseUpLuck;
			baseShip.stock = details.filter(v => v.lv === baseLv && v.area === baseArea).length;
			baseShip.ex = details[0].ex;

			let doneLv = [{ lv: baseLv, area: baseArea }];

			if (details.length >= 2) {
				for (let i = 1; i < details.length; i++) {
					const lv = details[i].lv;
					const upLuck = details[i].st[4];
					const area = details[i].area <= MAX_AREA && details[i].area > 0 ? details[i].area : -1;
					// 同じレベルかつ札の艦はまとめるため追加不要
					if (doneLv.find(v => v.lv === lv && v.area === area)) continue;

					// Lv違いの艦娘を生成
					const newShip = Object.assign({}, baseShip);
					newShip.lv = lv;
					newShip.area = area;
					newShip.stock = details.filter(v => v.lv === lv && v.area === area).length;
					newShip.upLuck = upLuck;
					newShip.ex = details[i].ex;
					ships.splice(index, 0, newShip);

					// このレベルは配置済み
					doneLv.push({ lv: lv, area: area });
				}
			}
		}
	}

	// よく使う順ソート
	if (isFrequent && setting.selectedHistory[1]) {
		const lst = setting.selectedHistory[1];
		ships.sort((a, b) => lst.filter(v => v === b.id).length - lst.filter(v => v === a.id).length);
	}

	// 艦種ソート いろいろ弄る
	ships.sort((a, b) => {
		if ((a.type === 7 && b.type !== 7) || (b.type === 7 && a.type !== 7)) {
			// 軽空母は下に
			return b.type - a.type;
		}
		else if ((a.type === 6 && b.type !== 6) || (b.type === 6 && a.type !== 6)) {
			// 航巡を上に
			return b.type - a.type;
		}
		else if ((a.type === 10 && b.type !== 10) || (b.type === 10 && a.type !== 10)) {
			// 航空戦艦を上に
			return b.type - a.type;
		}
		else {
			// それ以外は昇順
			return a.type - b.type;
		}
	});

	const fragment = document.createDocumentFragment();
	const imgWidth = 120;
	const imgHeight = 30;

	let prevType = 0;
	let prevType2 = 0;
	for (const ship of ships) {
		// 大発チェック
		if (dispDaihatsu && !OK_DAIHATSU_TYPE.includes(ship.type) && !OK_DAIHATSU_SHIP.includes(ship.api)) {
			continue;
		}
		// カミ車チェック
		if (dispKamisha && !OK_NAIKATEI_TYPE.includes(ship.type) && !OK_NAIKATEI_SHIP.includes(ship.api)) {
			continue;
		}

		// 残り隻数
		let shipCount = 1;
		// 使用済みチェック
		if (dispInStock && shipStock) {

			if (!ship.lv) {
				// lvの概念がない時点で所持数0なのでサヨナラ
				continue;
			}

			if (ship.stock) {
				// 所持数2以上あり
				shipCount = ship.stock;
			}

			// 使用済み一覧にあるかチェック ブラックリスト方式で所持数を減らす
			const usedCount = usedShip.filter(v => v.id === ship.id && v.lv === ship.lv && v.area === ship.area).length;
			shipCount -= usedCount;
			if (shipCount <= 0 && !dispEquipped) {
				continue;
			}
		}

		// ラッパー
		const $shipDiv = document.createElement('div');
		// 0を切っていれば選択不可
		if (dispInStock && dispEquipped && !shipCount) {
			$shipDiv.className = `ship_tr ship_tr_disabled d-flex ${displayMode === "multi" ? 'tr_multi' : ''}`;
		}
		else {
			$shipDiv.className = `ship_tr general_tr d-flex ${displayMode === "multi" ? 'tr_multi' : ''}`;
		}
		$shipDiv.dataset.shipid = ship.id;
		$shipDiv.dataset.level = ship.lv ? ship.lv : 99;
		$shipDiv.dataset.area = ship.area > 0 ? ship.area : 0;
		$shipDiv.dataset.luck = ship.luck + ship.upLuck;
		$shipDiv.id = 'ship_tr_' + ship.id;

		// アイコンラッパー
		const $iconDiv = document.createElement('div');
		$iconDiv.className = 'ml-1 align-self-center pt-1';
		// アイコン
		const img = document.createElement('img');
		img.width = imgWidth;
		img.height = imgHeight;
		img.src = `../img/ship/${ship.id}.png`;
		$iconDiv.appendChild(img);
		if (dispInStock && ship.area > 0) {
			$iconDiv.classList.add('exist_area');
			const areaImg = document.createElement('img');
			areaImg.className = 'area_banner';
			areaImg.src = `../img/util/area${ship.area}.png`;
			$iconDiv.appendChild(areaImg);
		}

		// ID 名称 ラッパー
		const $infoDiv = document.createElement('div');
		$infoDiv.className = 'ml-1 align-self-center';

		// IDかLv
		const $idDiv = document.createElement('div');
		$idDiv.className = 'text-primary font_size_11';
		if (dispInStock) {
			// 所持数モードならIDではなくLvで
			$idDiv.textContent = 'Lv : ' + ship.lv;
		}
		else {
			// 所持数にこだわらないなら艦娘IDで
			$idDiv.textContent = 'ID : ' + ship.id;
		}

		// 名称
		const $nameDiv = document.createElement('div');
		$nameDiv.className = 'd-flex';
		$nameDiv.textContent = ship.name;

		// 残り個数
		const $stockDiv = document.createElement('div');
		$stockDiv.className = 'ml-1 ship_td_stock align-self-center ' + (dispInStock ? '' : 'd-none');
		$stockDiv.textContent = `×${shipCount}`;
		$nameDiv.appendChild($stockDiv);

		$infoDiv.appendChild($idDiv);
		$infoDiv.appendChild($nameDiv);
		$shipDiv.appendChild($iconDiv);
		$shipDiv.appendChild($infoDiv);

		// スロットたち
		if (displayMode !== 'multi') {
			for (let index = 0; index < 5; index++) {
				const $slotDiv = document.createElement('div');
				$slotDiv.className = 'ship_td_slot font_size_12 align-self-center ' + (index === 0 ? 'ml-auto' : '');
				$slotDiv.textContent = (index < ship.slot.length ? ship.slot[index] : '');

				$shipDiv.appendChild($slotDiv);
			}
		}

		// 艦種分割ライン　絶対
		if (prevType !== ship.type) {
			const $typeDiv = document.createElement('div');
			$typeDiv.className = 'type_divider mt-4';

			const $type = document.createElement('div');
			$type.className = 'align-self-center font_size_16';
			$type.textContent = API_SHIP_TYPE.find(v => v.id === ship.type).name;

			const $typeLine = document.createElement('div');
			$typeLine.className = 'flex-grow-1 border-bottom align-self-center mx-2';

			$typeDiv.appendChild($type);
			$typeDiv.appendChild($typeLine);

			fragment.appendChild($typeDiv);
		}

		// 艦型分割ライン (よくあるソート以外)
		if (!isFrequent && prevType2 !== ship.type2) {
			const $typeDiv = document.createElement('div');
			$typeDiv.className = 'type_divider mt-2 ml-1';

			const $type = document.createElement('div');
			$type.className = 'font_size_12 font_color_half align-self-center';
			const ctype = API_CTYPE.find(v => v.id === ship.type2) || { name: '' };
			$type.textContent = ctype.name;

			$typeDiv.appendChild($type);

			fragment.appendChild($typeDiv);
		}

		prevType = ship.type;
		prevType2 = ship.type2;
		fragment.appendChild($shipDiv);
	}

	if (displayMode === "multi") {
		modal.classList.add('modal-xl');
		tbody.classList.add('multi_mode');
		const a = modal.getElementsByClassName('scroll_thead')[0];
		a.classList.add('d-none');
		a.classList.remove('d-flex');
	}
	else {
		modal.classList.remove('modal-xl');
		tbody.classList.remove('multi_mode');
		const a = modal.getElementsByClassName('scroll_thead')[0];
		a.classList.add('d-flex');
		a.classList.remove('d-none');
	}

	tbody.innerHTML = '';
	tbody.appendChild(fragment);
}

/**
 * 敵艦入力欄を生成(可視化)
 * @param {number} count (可視化)する個数
 */
function createEnemyInput(count) {
	$('.battle_content').each((i, e) => {
		if (i < count) $(e).removeClass('d-none');
		else $(e).addClass('d-none');
	});
	$('#battle_count').val(count);

	// 基地派遣セレクト調整
	$('#land_base_target_buttons').find('.btn-group').each((i, e) => {
		$(e).find('.btn').each((ii, el) => {
			if (ii < count) $(el).removeClass('disabled btn-outline-secondary').addClass('btn-outline-info');
			else $(el).addClass('disabled btn-outline-secondary').removeClass('btn-outline-info');
		});
	});

	// 結果表示タブ調整
	$('#display_battle_tab').find('.nav-link').each((i, e) => {
		$(e).removeClass('active');
		if (i < count) $(e).parent().removeClass('d-none');
		else $(e).parent().addClass('d-none');
	});
	$('#display_battle_tab').find(`[data-disp="${count}"]`).addClass('active');

	battleCount = count;
	displayBattle = count - 1;

	// 陣形の初期化 or スライス
	const len = selectedFormations.length;
	if (len <= battleCount) {
		for (let i = 0; i < battleCount - len; i++) {
			selectedFormations.push(1);
		}
	}
	else {
		selectedFormations = selectedFormations.slice(0, battleCount);
	}
}

/**
 * 敵一覧テーブル生成
 */
function initializeEnemyTable() {
	const fragment = document.createDocumentFragment();
	const imgWidth = 128;
	const imgHeight = 32;
	let dispData = [];
	let prevType = 0;

	for (const typeObject of ENEMY_TYPE) {
		// 姫級以外取得
		if (typeObject.id === 1) continue;
		const tmp = ENEMY_DATA.filter(x => x.type[0] === typeObject.id);
		dispData = dispData.concat(tmp.sort((a, b) => a.orig > b.orig ? 1 : a.orig < b.orig ? -1 : a.id - b.id));
	}
	// 姫系取得、IDソートして結合
	const princesses = ENEMY_DATA.filter(x => x.type[0] === 1);
	dispData = dispData.concat(princesses.sort((a, b) => a.id > b.id ? 1 : -1));

	for (const data of dispData) {
		const enemy = new Enemy(data.id)
		// ラッパー
		const $enemyDiv = document.createElement('div');
		$enemyDiv.className = 'enemy enemy_tr general_tr d-flex';
		$enemyDiv.dataset.enemyid = enemy.id;
		$enemyDiv.id = 'enemy_tr_' + enemy.id;

		// アイコンラッパー
		const $iconDiv = document.createElement('div');
		$iconDiv.className = 'ml-1 align-self-center';
		// アイコン
		const img = document.createElement('img');
		img.width = imgWidth;
		img.height = imgHeight;
		img.src = `../img/enemy/${enemy.id}.png`;
		$iconDiv.appendChild(img);

		// ID 名称 ラッパー
		const $infoDiv = document.createElement('div');
		$infoDiv.className = 'ml-1 align-self-center';
		// ID
		const $idDiv = document.createElement('div');
		$idDiv.className = 'text-primary font_size_11';
		$idDiv.textContent = 'ID : ' + (enemy.id + 1500);
		// 名称
		const $nameDiv = document.createElement('div');
		$nameDiv.className = 'font_size_12';
		$nameDiv.innerHTML = drawEnemyGradeColor(enemy.name);

		$infoDiv.appendChild($idDiv);
		$infoDiv.appendChild($nameDiv);

		// 複数表示時のカテゴリ分け罫線
		if (prevType !== enemy.type[0] && enemy.id !== -1) {
			const $typeDiv = document.createElement('div');
			$typeDiv.className = 'w-100 d-flex mt-3 divide_line';

			const $type = document.createElement('div');
			$type.className = 'font_size_12 font_color_half align-self-center';
			$type.textContent = ENEMY_TYPE.find(v => v.id === enemy.type[0]).name;

			const $typeLine = document.createElement('div');
			$typeLine.className = 'flex-grow-1 border-bottom align-self-center mx-2';

			$typeDiv.appendChild($type);
			$typeDiv.appendChild($typeLine);

			fragment.appendChild($typeDiv);

			prevType = enemy.type[0];
		}

		$enemyDiv.appendChild($iconDiv);
		$enemyDiv.appendChild($infoDiv);

		// 制空値
		const $apDiv = document.createElement('div');
		$apDiv.className = 'ml-auto align-self-center enemy_td_ap';
		$apDiv.textContent = enemy.landBaseAirPower > enemy.airPower ? `${enemy.airPower} (${enemy.landBaseAirPower})` : enemy.airPower;

		$enemyDiv.appendChild($apDiv);

		fragment.appendChild($enemyDiv);
	}
	document.getElementById('enemy_tbody').appendChild(fragment);
}

/**
 * 敵一覧テーブルを描画
 */
function createEnemyTable() {
	const type = castInt($('#enemy_type_select').val())
	const modal = document.getElementById('modal_enemy_select').getElementsByClassName('modal-dialog')[0];
	const tbody = document.getElementById('enemy_tbody');
	const displayMode = modal.querySelector('.toggle_display_type.selected').dataset.mode;
	const searchWord = $('#enemy_word').val().trim();

	if (!tbody.childElementCount) initializeEnemyTable();

	if (displayMode === "multi") {
		modal.classList.add('modal-xl');
		tbody.classList.add('d-flex', 'flex-wrap');
		const a = modal.getElementsByClassName('scroll_thead')[0];
		a.classList.add('d-none');
		a.classList.remove('d-flex');
	}
	else {
		modal.classList.remove('modal-xl');
		tbody.classList.remove('d-flex', 'flex-wrap');
		const a = modal.getElementsByClassName('scroll_thead')[0];
		a.classList.add('d-flex');
		a.classList.remove('d-none');
	}

	for (const enemy of ENEMY_DATA) {
		const tr = document.getElementById('enemy_tr_' + enemy.id);
		if (displayMode === "multi") tr.classList.add('enemy_tr_multi');
		else tr.classList.remove('enemy_tr_multi');

		if (searchWord) {
			if ((enemy.id + 1500) == searchWord || enemy.name.includes(searchWord)) {
				tr.classList.add('d-flex');
				tr.classList.remove('d-none');
			}
			else {
				tr.classList.add('d-none');
				tr.classList.remove('d-flex');
			}
			continue;
		}

		if ((type === 0 || enemy.type.includes(type))) {
			tr.classList.add('d-flex');
			tr.classList.remove('d-none');
		}
		else {
			tr.classList.add('d-none');
			tr.classList.remove('d-flex');
		}
	}

	// 複数表示時カテゴリ分け表示
	if (displayMode === "multi") {
		if (type === 0) {
			for (const e of tbody.getElementsByClassName('divide_line')) {
				e.classList.add('d-flex');
				e.classList.remove('d-none');
			}
		}
		else {
			for (const e of tbody.getElementsByClassName('divide_line')) {
				e.classList.remove('d-flex');
				e.classList.add('d-none');
			}
		}
		for (const e of tbody.getElementsByClassName('enemy_td_ap')) {
			e.classList.add('d-none');
		}
	}
	else {
		// 制空値表示
		for (const e of tbody.getElementsByClassName('divide_line')) {
			e.classList.add('d-none');
			e.classList.remove('d-flex');
		}
		for (const e of tbody.getElementsByClassName('enemy_td_ap')) {
			e.classList.remove('d-none');
		}
	}

	// 艦隊選択モーダル内のボタン非活性
	$('#modal_enemy_select').find('.btn_remove').prop('disabled', true);
}

/**
 * 機体プリセットを生成、展開
 */
function loadPlanePreset() {
	const $modal = $('#modal_plane_preset');
	// storage 読み込み
	planePreset = loadLocalStorage('planePreset');

	// storage に存在しなかった場合初期プリセットを展開
	if (!planePreset) {
		planePreset = DEFAULT_PLANE_PRESET.concat();
	}

	const parentId = castInt($('#modal_plane_preset').data('parentid'));
	let presetText = '';
	const len = planePreset.length;
	for (let index = 0; index < len; index++) {
		const preset = planePreset[index];
		let infoText = `
			<div class="preset_td preset_td_info text-danger cur_help ml-auto" data-toggle="tooltip" data-boundary="window"
				title="全ての装備が展開できません。">
				<i class="fas fa-exclamation-triangle"></i>
			</div>
		`;
		let i = 0;
		for (const plane of preset.planes) {
			if (plane.id <= 0) i += 1;
			else if (checkInvalidItem(parentId, ITEM_DATA.find(v => v.id === plane.id), i)) {
				infoText = `
				<div class="preset_td preset_td_info text-warning cur_help ml-auto" data-toggle="tooltip" data-boundary="window"
					title="展開できない装備が含まれています。">
					<i class="fas fa-exclamation-triangle"></i>
				</div>`;
				i += 1;
			}
			if (i === preset.planes.length) infoText = '';
		}

		presetText += `
			<div class="preset_tr general_tr d-flex px-1 py-1_5 my-1 w-100 cur_pointer" data-presetid="${preset.id}">
				<div class="preset_td text-primary">${index + 1}.</div>
				<div class="preset_td ml-2">${preset.name}</div>
					${infoText}
			</div>
		`;
	}

	// アラート非表示
	$modal.find('.alert').addClass('d-none');
	$modal.find('.preset_tr').removeClass('preset_selected');
	$modal.find('.preset_tbody').html(presetText);
	$modal.find('.preset_name')
		.val('左のプリセット一覧をクリック')
		.prop('disabled', true);
	$modal.find('.is-invalid').removeClass('is-invalid');
	$modal.find('.is-valid').removeClass('is-valid');
	$modal.find('.preset_preview_tbody').html('');
	$modal.find('.btn:not(.btn_cancel)').prop('disabled', true);
	$('.preset_td_info').tooltip();
}

/**
 * 機体プリセット詳細欄に引数のプリセットデータを展開
 * 第一引数にデータがなかった場合は新規作成として DOM 構築を行う
 * @param {Object} preset { id:x, name:'', planes:[] }構造のオブジェクト
 */
function drawPlanePresetPreview(preset) {
	let text = '';
	// 表示用の機体のデータ
	let planes = [];
	const $modal = $('#modal_plane_preset');
	const parentId = castInt($('#modal_plane_preset').data('parentid'));

	// アラート非表示
	$modal.find('.alert').addClass('d-none');

	// 保存編成が見つかってる場合
	if (preset) {
		$modal.find('.preset_name').val(preset.name);
		for (const plane of preset.planes) {
			const raw = ITEM_DATA.find(v => v.id === plane.id);
			const presetPlane = { id: 0, type: 0, itype: 0, name: '', remodel: 0 };
			if (raw) {
				presetPlane.id = plane.id;
				presetPlane.type = raw.type;
				presetPlane.itype = raw.itype;
				presetPlane.name = raw.name;
				presetPlane.remodel = plane.remodel;
			}
			planes.push(presetPlane);
		}
	}
	else {
		// プリセットが見つからなかったので新規登録画面呼び出し
		$modal.find('.preset_name').val('');

		$target.find('.' + ($target.attr('class').includes('lb_tab') ? 'lb_plane' : 'ship_plane')).each((i, e) => {
			const plane = ITEM_DATA.find(v => v.id === castInt($(e)[0].dataset.planeid));
			// 装備なしは詰める動き
			if (plane) {
				const presetPlane = {
					id: plane.id,
					type: plane.type,
					itype: plane.itype,
					name: plane.name,
					remodel: castInt($(e).find('.remodel_value').text())
				};
				planes.push(presetPlane);
			}
		});

		if (planes.length === 0) $modal.find('.alert').removeClass('d-none');
	}

	const warningIcon = `
		<div class="preset_preview_td_info ml-2 text-warning cur_help" data-toggle="tooltip" title="展開先に不適合な装備です">
			<i class="fas fa-exclamation-triangle"></i>
		</div>
	`;
	let idx = 0;
	for (const plane of planes) {
		if (plane.id) {
			const needWarning = !checkInvalidItem(parentId, plane, idx++);
			text += `
			<div class="preset_preview_tr d-flex justify-content-start border-bottom" data-planeid="${plane.id}" data-remodel="${plane.remodel}">
				<div class="preset_preview_td_type"><img class="img-size-25" src="../img/type/icon${plane.itype}.png"></div>
				<div class="preset_preview_td_name ml-1 py-2">${plane.name}</div>
				<div class="text_remodel">${plane.remodel ? '★' + plane.remodel : ''}</div>
				` + (needWarning ? warningIcon : '') + `
			</div>`;
		}
		else {
			text += `
			<div class="preset_preview_tr d-flex justify-content-start border-bottom" data-planeid="0" data-remodel="0">
				<div class="preset_preview_td_type"><img class="img-size-25" src="../img/type/undefined.png"></div>
				<div class="preset_preview_td_name ml-1 py-2">未装備</div>
			</div>`;
		}
	}
	$modal.find('.btn_expand_preset').prop('disabled', !preset);
	$modal.find('.btn_delete_preset').prop('disabled', !preset);
	$modal.find('.btn_commit_preset').prop('disabled', true);
	$modal.find('.preset_name').prop('disabled', planes.length === 0);
	$modal.find('.is-invalid').removeClass('is-invalid');
	$modal.find('.is-valid').removeClass('is-valid');
	$modal.find('.preset_preview_tbody').html(text);
	$modal.find('.preset_preview_td_info').tooltip();
}

/**
 * 機体プリセット更新
 */
function updatePlanePreset() {
	const presetId = castInt($('.preset_selected').data('presetid'));
	const planes = [];
	$('.preset_preview_tr').each((i, e) => {
		planes.push({ id: castInt($(e)[0].dataset.planeid), remodel: castInt($(e)[0].dataset.remodel) });
	});

	let max_id = 0;
	for (const preset of planePreset) if (max_id < preset.id) max_id = preset.id;
	const newPreset = {
		id: (presetId === -1 ? max_id + 1 : presetId),
		name: $('#modal_plane_preset').find('.preset_name').val().replace(/^\s+|\s+$/g, ''),
		planes: planes
	};

	planePreset = planePreset.filter(v => v.id !== presetId);
	planePreset.push(newPreset);
	planePreset.sort((a, b) => a.id - b.id);
	// ローカルストレージ保存
	saveLocalStorage('planePreset', planePreset);
}

/**
 * 機体プリセット削除
 */
function deletePlanePreset() {
	const presetId = castInt($('.preset_selected').data('presetid'));
	planePreset = planePreset.filter(v => v.id !== presetId);
	planePreset.sort((a, b) => a.id - b.id);
	// ローカルストレージ保存
	saveLocalStorage('planePreset', planePreset);
}

/**
 * map_dataからマップ情報を読み込む
 */
function loadMapData() {
	fetch("../js/map_data.json", { method: "GET", })
		.then(res => {
			if (res.ok) {
				res.json().then(v => {
					ENEMY_PATTERN = v['ENEMY_PATTERN'];
					// マップ関連のセレクト更新
					createMapSelect();
					createNodeSelect();
				});
			}
			else inform_danger(res.statusText);
		}).catch(error => {
			sendErrorLog(error);
		});
}

/**
 * 海域情報の動的取得(初回限定)
 */
function modal_enemy_pattern_Shown() {
	if ($('#map_select').html()) return;

	// 初回海域データの動的取得
	$('#map_select').html('<option value="1">海域データ読込中</option>');
	loadMapData();
}

/**
 * 海域選択欄生成
 */
function createMapSelect() {
	let text = '';
	for (const w of WORLD_DATA) {
		const world = w.world;
		const maps = MAP_DATA.filter(m => Math.floor(m.area / 10) === world);
		text += `<optgroup label="${w.name}">`;
		for (const m of maps) {
			const map = m.area % 10;
			text += `<option value="${m.area}">${world > 20 ? 'E' : world}-${map} : ${m.name}</option>`;
		}
	}

	$('#map_select').html(text);
	$('#select_preset_category').html(text);
}

/**
 * マップ画像拡大ボタンクリック
 */
function btn_zoom_map_Clicked() {
	// 今開いている海域マップを拡大
	const area = castInt($('#map_select').val());
	document.getElementById('big_map_img').src = `../img/map/detail/${area}.png`;
	$('#modal_big_map').modal('show');
}

/**
 * マス情報を生成
 */
function createNodeSelect() {
	const area = castInt($('#map_select').val());
	let lv = 0;
	if (area < 200) {
		$('#select_difficulty_div').addClass('d-none');
	}
	else {
		$('#select_difficulty_div').removeClass('d-none');
		lv = castInt($('#select_difficulty').val());
	}

	// マップ設定
	$('#map_img').attr('src', '../img/map/' + area + '.png');
	// マップ拡大鏡対応 2021夏以降
	if (area > 510 || [11, 65, 74].includes(area)) {
		document.getElementById('btn_zoom_map').classList.remove('d-none');
	}
	else {
		document.getElementById('btn_zoom_map').classList.add('d-none');
	}

	let patterns = ENEMY_PATTERN.filter(v => v.a === area && v.l === lv);
	// 重複は切る
	patterns = patterns.filter((x, i, self) => self.findIndex(v => v.n === x.n) === i);

	// 空襲はてっぺん
	patterns.sort((a, b) => {
		if (a.n == '空襲' && b.n == '空襲') return 0;
		else if (a.n == '空襲') return -1;
		else if (b.n == '空襲') return 1;
		else return 0;
	});
	const len = patterns.length;
	let text = '';
	let text2 = '';
	for (let index = 0; index < len; index++) {
		const nodeName = patterns[index].n;
		const coords = patterns[index].c;
		text += `
		<div class="d-flex node_tr general_tr justify-content-center py-1 w-100 cur_pointer" data-node="${nodeName}">
			<div class="align-self-center">${nodeName}</div>
		</div>
	`;

		// クリック座標設定
		if (coords !== '') {
			if (coords.split(',').length === 2) {
				const x = castInt(coords.split(',')[0]);
				const y = castInt(coords.split(',')[1]);
				text2 += `<area class="node" title="${nodeName}" coords="${x},${y},${x + 20},${y + 20}" shape="rect">`;
			}
			else {
				text2 += `<area class="node" title="${nodeName}" coords="${coords}" shape="rect">`;
			}
		}
	}

	$('#node_tbody').html(text);
	$('#clickable_nodes').html(text2);
	$('#enemy_pattern_tbody').html('');
	$('#enemy_pattern_select').html('<li class="nav-item"><a class="nav-link ' + (mainColor === "#000000" ? '' : 'nav-link-dark') + ' active" data-toggle="tab" href="#">編成1</a></li>');
	$('#enemy_pattern_air_power').text('0');
	$('#enemy_display_mode_parent').addClass('d-none').removeClass('d-flex');
	$('#btn_expand_enemies').prop('disabled', true);
	$('#btn_continue_expand').prop('disabled', true);
}

/**
 * 選択されている海域情報から敵艦隊を表示する
 * @param {number} patternNo パターン番号 未指定時は0
 */
function createEnemyPattern(patternNo = 0) {
	const area = castInt($('#map_select').val());
	const node = $('.node_selected').data('node');
	let lv = 0;
	if (area < 100) $('#select_difficulty_div').addClass('d-none');
	else {
		$('#select_difficulty_div').removeClass('d-none');
		lv = castInt($('#select_difficulty').val());
	}

	// 敵艦隊一覧生成
	let text = '';
	let sumAp = 0;
	let sumFleetAntiAir = 0;
	const patterns = ENEMY_PATTERN.filter(v => v.a === area && v.n === node && v.l === lv);
	const pattern = patterns[patternNo];
	const enemies = pattern.e;
	const enemiesLength = enemies.length;
	for (let index = 0; index < enemiesLength; index++) {
		const enemy = ENEMY_DATA.find(v => v.id === enemies[index]);
		if (!enemy) continue;
		const enemyObj = new Enemy(enemy.id);
		sumAp += enemyObj.airPower;
		sumFleetAntiAir += enemyObj.antiAirBonus;
		text += `
		<div class="enemy_pattern_tr mx-1 d-flex border-bottom" data-enemyid="${enemy.id}">
			<div class="enemy_pattern_tr_image mr-1">
				<img src="../img/enemy/${enemy.id}.png" class="enemy_img">
			</div>
			<div class="enemy_pattern_tr_text">
				<div class="font_size_11 text-primary">ID: ${enemy.id + 1500}</div>
				<div>${drawEnemyGradeColor(enemy.name)}</div>
			</div>
		</div>
		`;
	}

	// 陣形補正
	const formation = FORMATION.find(v => v.id === pattern.f);
	// 艦隊防空値 [陣形補正 * 各艦の艦隊対空ボーナス値の合計] * 2
	const fleetAntiAir = Math.floor(formation.correction * sumFleetAntiAir) * 2;

	$('#enemy_pattern_anti_air').text(fleetAntiAir);
	$('#enemy_pattern_formation').text(formation.name);

	// 半径
	if (pattern.r > 0) {
		$('#enemy_pattern_radius_parent').removeClass('d-none');
		$('#enemy_pattern_radius').removeClass('d-none');
		$('#enemy_pattern_radius').text(pattern.r);
	}
	else {
		$('#enemy_pattern_radius_parent').addClass('d-none');
		$('#enemy_pattern_radius').addClass('d-none');
	}


	// 編成パターンタブ生成
	if (patternNo === 0) {
		let tabText = '';
		for (let i = 0; i < patterns.length; i++) {
			tabText += `
			<li class="nav-item font_size_12">
				<a class="nav-link ${mainColor === "#000000" ? '' : 'nav-link-dark'} ${i === 0 ? 'active' : ''}" data-toggle="tab" data-disp="${i}" href="#">
					${(patterns[i].d ? patterns[i].d : '編成' + (i + 1))}
				</a>
			</li>
			`;
		}
		$('#enemy_pattern_select').html(tabText);
	}

	const borders = getAirStatusBorder(sumAp);
	$('#enemy_pattern_tbody').html(text);
	$('#enemy_pattern_air_power').text(sumAp);
	$('#enemy_pattern_status0').text(borders[0]);
	$('#enemy_pattern_status1').text(borders[1]);
	$('#enemy_pattern_status2').text(borders[2]);
	$('#enemy_pattern_status3').text(borders[3]);
	$('#btn_expand_enemies').prop('disabled', false);
	$('#btn_continue_expand').prop('disabled', false);

	// 表示形式切り替えの有効無効と表示形式
	if (enemiesLength > 6) {
		$('#enemy_display_mode_parent').removeClass('d-none').addClass('d-flex');
		if (setting.enemyDisplayImage) {
			$('#enemy_pattern_tbody').find('.enemy_pattern_tr_text').addClass('d-none');
		}
		else {
			$('#enemy_pattern_tbody').find('.enemy_pattern_tr_image').addClass('d-none');
		}
	}
	else {
		$('#enemy_display_mode_parent').addClass('d-none').removeClass('d-flex');
	}
}

/**
 * 敵艦隊を展開する
 */
function expandEnemy() {
	const area = castInt($('#map_select').val());
	const node = $('.node_selected').data('node');
	const patternNo = castInt($('#enemy_pattern_select').find('.nav-link.active').data('disp'));
	let lv = 0;
	if (area >= 200) {
		lv = castInt($('#select_difficulty').val());
	}

	const pattern = ENEMY_PATTERN.filter(v => v.a === area && v.n === node && v.l === lv)[patternNo];

	// 展開対象が空襲なら防空モードに乗っ取り
	if (!isDefMode && node === '空襲') {
		toggleDefenseMode(true);
		// みんな防空に
		$('.ohuda_select').each((i, e) => { $(e).val(0); });
		$target = $('#air_raid_enemies');
	}
	else if (isDefMode && node !== '空襲') {
		toggleDefenseMode(false);
		// みんな出撃に
		$('.ohuda_select').each((i, e) => { if (castInt($(e).val()) === 0) $(e).val(-1); });
		$target = $('.battle_content:first');
	}

	// 戦闘マス情報
	const cellType = isDefMode && pattern.t !== 5 ? 3 : pattern.t;
	$target.find('.cell_type').val(cellType);
	cell_type_Changed($target.find('.cell_type'), false);
	// 陣形
	$target.find('.formation').val(pattern.f);

	// 敵展開
	$target.find('.enemy_content').each((i, e) => {
		if (i < pattern.e.length) setEnemyDiv($(e), pattern.e[i]);
		else clearEnemyDiv($(e));
	});
	// 半径
	$target.find('.enemy_range').text(pattern.r);

	// 進行航路情報を付与
	$target[0].dataset.celldata = area + "_" + pattern.n + (pattern.d ? '(' + pattern.d + ')' : '');
}

/**
 * プリセ保存画面展開時
 */
function modal_main_preset_Shown() {
	if ($('#select_preset_category').html()) return;

	// 初回海域データの動的取得
	$('#select_preset_category').html('<option value="1">海域データ読込中</option>');

	// フォルダーセレクトボックスの初期化
	const folders = setting.presetFolders;
	let text = '<option value="0">指定なし</option>';
	for (const folder of folders) {
		text += `<option value="${folder.id}">${folder.name}</option>`;
	}
	$('#preset_folder').html(text);

	loadMapData();
}

/**
 * 編成プリセット 新規登録 / 更新処理
 */
function updateMainPreset(isUploadOnly = false) {
	// 保存する編成の内容データ
	const presetBody = encodePreset();
	// 今現在のタブ情報
	const activePreset = getActivePreset();
	// 何らかの原因でidがない場合
	if (!activePreset.id) {
		activePreset.id = getUniqueId();
	}
	// 何らかの原因でhistoryがない場合
	if (!activePreset.history.histories.length) {
		activePreset.history.histories[0] = presetBody;
	}
	else {
		activePreset.history.histories[activePreset.history.index] = presetBody;
	}
	// 名前の更新
	activePreset.name = document.getElementById('input_preset_name').value.trim();
	// プリセット生成
	const preset = [
		activePreset.id,
		activePreset.name,
		presetBody,
		document.getElementById('preset_remarks').value.trim(),
		formatDate(new Date(), 'yyyy/MM/dd HH:mm:ss'),
		castInt($('#preset_folder').val())
	];

	if ($('#allow_upload_preset').prop('checked')) {
		// 編成のアップロード
		uploadMainPreset(preset);
	}

	// アップロードのみモードならここで終了
	if (isUploadOnly) {
		$('#modal_main_preset').modal('hide');
		return;
	}

	// プリセット一覧への登録作業
	let isUpdate = false;
	// 別名保存モードかどうか
	if ($('#modal_main_preset').find('.btn_commit_preset').hasClass('rename')) {
		// 更新になってしまわぬよう新しいidを付与 -> 上書きにならず追加になる
		const newId = getUniqueId();
		preset[0] = newId;

		// ここでidも変更して、下のupdateActivePreset処理で新タブが生成されるように
		activePreset.id = newId;
	}

	const presets = loadLocalStorage('presets') || [];

	for (let i = 0; i < presets.length; i++) {
		if (presets[i][0] === preset[0]) {
			// フォルダー引継ぎ
			if (presets[i].length >= 6) {
				preset[5] = presets[i][5];
			}
			// 同idを持つプリセットがあれば上書き
			presets[i] = preset;
			isUpdate = true;
			break;
		}
	}

	// 更新がなかったら新規登録
	if (!isUpdate) {
		presets.push(preset);
		inform_success(`プリセット「${preset[1]}」の新規登録が完了しました。`);
		// 編成メモが更新されている可能性があるので、activePresetのmemoを置き換えて同期
		activePreset.memo = preset[3];
	}
	else {
		inform_success(`プリセット「${preset[1]}」の編成データの更新が完了しました。`);
	}

	// 保存編成情報更新
	saveLocalStorage('presets', presets);
	// タブ情報の更新
	updateActivePreset(activePreset);
	// タブ再構築
	setTab();

	$('#modal_main_preset').modal('hide');
}

/**
 * 編成のアップロード
 * @param {*} preset アップロード対象の編成
 */
function uploadMainPreset(preset) {
	const area = castInt($('#select_preset_category').val());
	const user = $('#upload_user').val().trim();

	setting.uploadUserName = user;
	saveSetting();

	const newPreset = {
		id: preset[0],
		name: preset[1],
		data: preset[2],
		memo: preset[3],
		createdAt: firebase.firestore.FieldValue.serverTimestamp(),
		map: area,
		level: area > 400 ? castInt($('#select_preset_level').val()) : 0,
		user: user
	};

	if (!fb) initializeFB();
	if (fb) {
		fb.runTransaction(function (tran) {
			const ref = fb.collection('presets');
			const d = ref.doc();
			return tran.get(d).then(async () => {
				await tran.set(d, newPreset);
				return newPreset;
			})
		}).then(function (res) {
			inform_success(`プリセット「${preset[1]}」の編成データのアップロードが完了しました。`);
		}).catch(function (err) {
			console.error(err);
			inform_danger('エラーが発生しました。');
		});
	}
	else inform_danger('謎の理由により、アップロードに失敗しました。');
}


/**
 * 指定したidのプリセットデータを展開する
 * @param {Object} preset 展開対象プリセット(デコード済)
 * @param {boolean} isResetLandBase データ未指定の際、基地航空隊をリセットする
 * @param {boolean} isResetFriendFleet 艦隊を書き換えるかどうか
 * @param {boolean} isResetEnemyFleet データ未指定の際、敵艦隊をリセットする
 */
function expandMainPreset(preset, isResetLandBase = true, isResetFriendFleet = true, isResetEnemyFleet = true) {
	if (!preset) return;
	try {
		// 基地航空隊展開
		const landBase = preset[0];
		let hasLandBaseData = false;
		$('.lb_plane').each((i, e) => {
			if (!landBase || landBase.length === 0) return;
			const raw = landBase[0].find(v => v[4] === i);
			if (raw && raw.length !== 0) {
				const plane = { id: raw[0], prof: raw[1], remodel: raw[2], slot: raw[3] };
				setLBPlaneDiv($(e), plane);
				hasLandBaseData = true;
			}
			else if (isResetLandBase) setLBPlaneDiv($(e));
		});
		$('.ohuda_select').each((i, e) => {
			// disabled 解除
			$(e).find('option').prop('disabled', false);
			// 取得した札値 そもそも基地データがないならリセットはせずそのまま
			if (hasLandBaseData && landBase && landBase.length >= 2) {
				const huda = castInt(landBase[1][i], -1);
				$(e).val(huda === 1 ? 2 : huda);
			}
			else if (isResetLandBase) $(e).val(-1);
		});

		// 基地タゲ
		if (landBase && landBase.length >= 3) {
			for (let lbNo = 0; lbNo <= 2; lbNo++) {
				document.getElementById(`lb${lbNo + 1}_target_1`).value = landBase[2][lbNo * 2];
				document.getElementById(`lb${lbNo + 1}_target_2`).value = landBase[2][lbNo * 2 + 1];
			}
		}
		// 防空計算モード？
		if (preset.length >= 5) {
			toggleDefenseMode(preset[4]);
		}
		else {
			toggleDefenseMode(false);
		}

		if (isResetFriendFleet) {
			// 連合(:1)　遊撃部隊(:2)チェック
			let maxShipCount = 6;
			if (preset[1].length && preset[1][0] && preset[1][0].length >= 6) {
				// 遊撃部隊フラグがあれば最大7隻に拡張
				maxShipCount = preset[1][0][5] === 2 ? 7 : 6;

				document.getElementById('union_fleet')['checked'] = preset[1][0][5] === 1;
				document.getElementById('yugeki_fleet')['checked'] = preset[1][0][5] === 2;
			}

			clearShipDivAll(maxShipCount);
			let shipCountFleet1 = 0;
			let shipCountFleet2 = 0;
			// 艦娘展開
			$('.ship_tab:not(.d-none)').each((i, ship_tab) => {
				const ship = preset[1].find(v => v[2] === i);
				if (!ship) return;
				const $ship_tab = $(ship_tab);
				// 艦娘設置
				setShipDiv($ship_tab, ship[0], 99, (ship.length >= 8 && ship[7] ? ship[7] : 0));

				// 機体設置
				$ship_tab.find('.ship_plane').each((j, e) => {
					const $ship_plane = $(e);
					// このスロット番号と一致する機体を取得(plane[4]はスロット番号)
					let raw = ship[1].find(v => v[4] === j);

					if (!raw && $ship_plane.hasClass('expanded_slot')) {
						// 補強増設枠チェック
						raw = ship[1].find(v => v[4] === -1);
					}
					if (raw && !$ship_plane.hasClass('d-none')) {
						const plane = { id: raw[0], prof: raw[1], remodel: raw[2], slot: raw[3] };
						setPlaneDiv($ship_plane, plane, true);

						// スロットロック反映
						if (raw.length >= 6 && raw[5]) plane_unlock_Clicked($ship_plane.find('.plane_unlock'));
					}
				});

				// 無効化
				if (ship.length >= 4) {
					const $ship_disabled = $ship_tab.find('.ship_disabled');
					if (ship[3]) {
						$ship_disabled.addClass('disabled');
						$ship_disabled.children().addClass('fa-eye-slash').removeClass('fa-eye no_capture');
						$ship_tab.addClass('opacity4');
					}
					else {
						$ship_disabled.removeClass('disabled');
						$ship_disabled.children().removeClass('fa-eye-slash').addClass('fa-eye no_capture');
						$ship_tab.removeClass('opacity4');
					}
				}

				// 練度
				if (ship.length >= 5) {
					if (ship[4]) {
						$ship_tab.find('.ship_level').text(ship[4]);
					}
					else {
						$ship_tab.find('.ship_level').text(99);
					}
				}

				// 運
				if (ship.length >= 7) {
					if (ship[6] > 0) {
						$ship_tab.find('.ship_luck').text(ship[6]);
					}
					else {
						// そっとしておこう
					}
				}

				if (i < maxShipCount) shipCountFleet1 += 1;
				else shipCountFleet2 += 1;
			});

			display_ship_count_Changed($('#friendFleet_item1'), Math.max(shipCountFleet1, 1), true);
			display_ship_count_Changed($('#friendFleet_item2'), Math.max(shipCountFleet2, 1), true);
		}

		// 陣形　初期値
		document.getElementById('fleet_formation').value = 1;
		// 陣形、対空有効設定復帰
		if (preset.length >= 4 && preset[3]) {
			// 対空砲火有効化チェック復帰
			document.getElementById('adapt_stage2')['checked'] = true;

			try {
				// 配列を前提とする
				let lastValue = 1;
				selectedFormations = [];
				for (const d of preset[3]) {
					const formationId = castInt(d);

					if (formationId <= 0) {
						// 陣形IDがない 不適切(対空砲火テーブルの時代の遺産)
						document.getElementById('adapt_stage2')['checked'] = false;
						selectedFormations = [];
						lastValue = 1;
						break;
					}
					else {
						selectedFormations.push(formationId);
						lastValue = formationId;
					}
				}
				document.getElementById('fleet_formation').value = lastValue;
			} catch (error) {
				// 配列で解決できなかったら ～v1.12.3.1のケース
				const value = castInt(preset[3]);
				if (value) {
					// 埋める
					selectedFormations = [];
					for (let i = 0; i < 10; i++) {
						selectedFormations.push(value);
					}
					document.getElementById('adapt_stage2')['checked'] = true;
					document.getElementById('fleet_formation').value = value;
				}
			}
		}
		else {
			document.getElementById('adapt_stage2')['checked'] = false;
			selectedFormations = [];
		}

		// 敵艦展開
		let battle = 1;
		for (let index = 0; index < preset[2].length; index++) {
			if (battle < preset[2][index][0] + 1) battle = preset[2][index][0] + 1;
		}
		battle = Math.min(battle, 10);
		// クリア
		if (preset[2].length !== 0 || isResetEnemyFleet) {
			clearEnemyDivAll(battle);
			$('#battle_count').val(battle);
		}

		// v1.11.1 以前のプリセット(preset[5]が存在せず、preset[2]に防空の敵艦隊情報が入ってしまっている場合の対処用)
		const isOldVersion = isDefMode && preset.length < 6;

		$(isOldVersion ? '#air_raid_enemies' : '.battle_content').each((i, e) => {
			const enemyFleet = preset[2].find(v => v[0] === i);
			if (enemyFleet) {
				// セル名復帰
				if (enemyFleet.length >= 3) $(e)[0].dataset.celldata = enemyFleet[2];
				else $(e)[0].dataset.celldata = '';

				// 戦闘種別復帰
				if (enemyFleet.length >= 4) {
					const cellType = castInt(enemyFleet[3]);
					if (isOldVersion) {
						$(e).find('.cell_type').val([0, 5].includes(cellType) ? 5 : 3);
					}
					else $(e).find('.cell_type').val(cellType);
					cell_type_Changed($(e).find('.cell_type'), false);
				}
				else $(e).find('.cell_type').val(1);

				// 陣形復帰
				if (enemyFleet.length >= 5) $(e).find('.formation').val(enemyFleet[4]);
				else $(e).find('.formation').val(1);

				// 半径復帰
				if (enemyFleet.length >= 6) $(e).find('.enemy_range').text(enemyFleet[5]);
				else $(e).find('.enemy_range').text(0);

				let enemyIndex = 0;
				for (const id of enemyFleet[1]) {
					const $enemyContent = $(e).find('.enemy_content').eq(enemyIndex++);
					if (id > 0) setEnemyDiv($enemyContent, id);
					// 負値の場合は直接入力の制空値
					else if (id < 0) setEnemyDiv($enemyContent, -1, -(id));
					else clearEnemyDiv($enemyContent);
					$enemyContent.addClass('d-flex').removeClass('d-none');
				}
			}
		});

		// 防空モード用敵艦展開(いれば)
		if (preset.length >= 6) {
			const enemyFleet = preset[5];
			if (enemyFleet && enemyFleet.length === 3) {

				const $container = $('#air_raid_enemies');

				// 戦闘種別復帰
				const cellType = castInt(enemyFleet[1]);
				$container.find('.cell_type').val([0, 5].includes(cellType) ? 5 : 3);
				cell_type_Changed($container.find('.cell_type'), false);

				// 陣形復帰
				$container.find('.formation').val(enemyFleet[2]);

				let enemyIndex = 0;
				for (const id of enemyFleet[0]) {
					const $enemyContent = $container.find('.enemy_content').eq(enemyIndex++);

					if (id > 0) {
						setEnemyDiv($enemyContent, id);
					}
					// 負値の場合は直接入力の制空値
					else if (id < 0) {
						setEnemyDiv($enemyContent, -1, -(id));
					}
					else {
						clearEnemyDiv($enemyContent);
					}
					$enemyContent.addClass('d-flex').removeClass('d-none');
				}
			}
		}

		if (preset.length >= 7) {
			$('#admin_lv').val(preset[6]);
		}
		else {
			$('#admin_lv').val(120);
		}

	} catch (error) {
		// 全てクリアしておく
		$('.ohuda_select').val(-1);
		$('.lb_plane').each((i, e) => { setLBPlaneDiv($(e)); });
		clearShipDivAll(6);
		clearEnemyDivAll(1);
		$('#battle_count').val(1);

		// エラー通知
		sendErrorLog(error);
	}
}

/**
 * 現在の入力状況からbase64エンコード済みプリセットデータを生成、返却する
 * @returns {string} エンコード済プリセットデータ
 */
function encodePreset() {
	try {

		// 陣形取得 => ここは計算結果欄で選択されている陣形
		const formationId = castInt($('#fleet_formation').val());
		// 表示戦闘
		const mainBattle = isDefMode ? 0 : displayBattle;
		// 各戦闘陣形個別の値を更新（更新されるのは表示戦闘のもののみ）
		if (selectedFormations.length > mainBattle) {
			selectedFormations[mainBattle] = formationId;
		}
		else {
			// インデックスがおかしい場合はケツ
			selectedFormations[selectedFormations.length - 1] = formationId;
		}
		/*
			プリセットメモ
			基地: [0:機体群, 1:札群, 2:ターゲット戦闘番号[1-1, 1-2, 2-1, ..., 3-2]]
			全体: [0:id, 1:名前, 2:[0:基地プリセット, 1:艦隊プリセット, 2:敵艦プリセット, 3:陣形(対空有効無効を兼ねる), 4: 防空モードかどうか, 5: 防空時敵艦隊, 6: 司令部レベル], 3:メモ, 4:更新日時]
				艦隊: [0:id, 1: Item配列, 2: 配属位置, 3:無効フラグ, 4:練度, 5:連合フラグ, 6:運, 7:海域]
					装備: [0:id, 1:熟練, 2:改修値, 3:搭載数, 4:スロット位置, 5: スロットロック(任意、ロック済みtrue]
				敵艦: [0:戦闘位置, 1:[敵id配列], 2:マス名, 3:マス種別, 4:陣形, 5:半径]
				対空: 対空砲火適用有効なら陣形配列 その他空
				防空モード: そのまんま boolean
				防空モード敵艦隊: { 0:[敵id配列], 1:マス種別, 2:陣形 }
		*/
		const preset = [
			createLandBasePreset(),
			createFriendFleetPreset(),
			createEnemyFleetPreset(),
			document.getElementById('adapt_stage2')['checked'] ? selectedFormations : null,
			isDefMode,
			createAirRaidEnemyFleetPreset(),
			castInt($('#admin_lv').val())
		];
		const dataString = JSON.stringify(preset);
		const b64 = utf8_to_b64(dataString);
		const utf8 = b64_to_utf8(b64);
		// 複号までチェック
		JSON.parse(utf8);

		return b64;
	}
	catch (error) {
		// 失敗時は空のプリセットデータ
		const emp = [[], [], []];
		return utf8_to_b64(JSON.stringify(emp));
	}
}

/**
 * 基地航空隊プリセットを生成し返却
 * @returns {any[][]} 基地プリセット
 */
function createLandBasePreset() {
	// 基地: [0:機体群, 1:札群, 2:ターゲット戦闘番号[1-1, 1-2, 2-1, ..., 3-2]]
	const landBasePreset = [[], [], []];
	// inputItemsから生成するように変更
	const landBaseAll = inputItems.landBase;

	for (const landBase of landBaseAll.landBases) {
		// 機体群
		for (const plane of landBase.planes) {
			// [ (航空隊番号 - 1) * 4 + スロット番号 ]が、画面の見た目の位置
			const planeObj = [
				plane.id,
				plane.level,
				plane.remodel,
				plane.slot,
				(landBase.baseNo - 1) * 4 + (plane.slotNo - 1)
			];
			landBasePreset[0].push(planeObj);
		}

		// 札
		landBasePreset[1].push(landBase.mode);

		// ターゲット
		landBasePreset[2].push(landBase.target[0]);
		landBasePreset[2].push(landBase.target[1]);
	}

	return landBasePreset;
}

/**
 * 艦隊プリセットを生成し返却
 * @returns {Array} 艦隊プリセット
 */
function createFriendFleetPreset() {
	// 艦隊: [0:id, 1: plane配列, 2: 配属位置, 3:無効フラグ, 4:練度, 5:(通常0 連合1 遊撃2) , 6:運, 7:海域]
	const friendFleetPreset = [];
	const maxShipCount = getMaxShipCount();
	let shipIndex = 0;
	const fleetType = document.getElementById('union_fleet')['checked'] ? 1 : document.getElementById('yugeki_fleet')['checked'] ? 2 : 0;
	$('.ship_tab:not(.ui-draggable-dragging)').each((i, e) => {
		// 第2艦隊の開始を検知 遊撃部隊なら7
		if (i === maxShipCount) shipIndex = maxShipCount;
		// 非表示なら飛ばす
		if ($(e).attr('class').includes('d-none')) return;

		// 艦隊: [0:id, 1: plane配列, 2: 配属位置, 3:無効フラグ, 4:練度, 5:(通常0 連合1 遊撃2), 6:運, 7:海域]
		const ship = [
			castInt($(e)[0].dataset.shipid),
			[],
			shipIndex,
			($(e).find('.ship_disabled').hasClass('disabled') ? 1 : 0),
			castInt($(e).find('.ship_level').text()),
			fleetType,
			castInt($(e).find('.ship_luck').text()),
			castInt($(e).find('.area').text())
		];
		$(e).find('.ship_plane:not(.ui-draggable-dragging)').each((j, ce) => {
			const $ce = $(ce);
			// 装備: [0:id, 1:熟練, 2:改修値, 3:搭載数, 4:スロット位置, 5: スロットロック(任意、ロック済みtrue]
			const plane = [
				castInt($ce[0].dataset.planeid),
				castInt($ce.find('.prof_select')[0].dataset.prof),
				castInt($ce.find('.remodel_value')[0].textContent),
				castInt($ce.find('.slot').text()),
				$(ce).hasClass('expanded_slot') ? -1 : j,
				($ce.find('.plane_unlock').hasClass('d-none') ? 1 : 0)
			];
			// 装備されていない場合飛ばす
			if (plane[0] !== 0) ship[1].push(plane);
		});

		// 艦娘か機体が1件でもあれば追加
		if (ship[0] !== 0 || ship[1].length !== 0) {
			friendFleetPreset.push(ship);
			// インクリメント
			shipIndex += 1;
		}
	});

	return friendFleetPreset;
}

/**
 * 敵艦隊プリセットを生成し返却
 * @returns {Array} 敵艦隊プリセット
 */
function createEnemyFleetPreset() {
	const enemyFleetPreset = [];
	$('.battle_content').each((i, e) => {
		// 非表示なら飛ばす
		if ($(e).attr('class').includes('d-none')) return;
		// [0:戦闘位置, 1:enemyId配列(※ 直接入力時は負値で制空値), 2:マス名, 3:マス種別, 4:陣形, 5:半径]
		const enemyFleet = [
			i,
			[],
			$(e)[0].dataset.celldata,
			castInt($(e).find('.cell_type').val()),
			castInt($(e).find('.formation').val()),
			castInt($(e).find('.enemy_range').text())
		];
		$(e).find('.enemy_content').each((j, ce) => {
			const enemyId = castInt($(ce)[0].dataset.enemyid);
			const ap = castInt($(ce).find('.enemy_ap').text());
			if (enemyFleet[3] !== CELL_TYPE.grand && j >= 6) return;
			if (enemyId === 0) enemyFleet[1].push(0);
			else if (enemyId > 0) enemyFleet[1].push(enemyId);
			// ※直接入力なら制空値を負値にして格納
			else if (ap > 0) enemyFleet[1].push(-ap);
		});

		// 空じゃなければ追加
		if (enemyFleet[1].length !== 0) enemyFleetPreset.push(enemyFleet);
	});
	return enemyFleetPreset;
}

/**
 * 敵艦隊プリセットを生成し返却
 * @returns {Array} 敵艦隊プリセット
 */
function createAirRaidEnemyFleetPreset() {
	const $container = $('#air_raid_enemies');
	// [0:enemyId配列(※ 直接入力時は負値で制空値), 1:マス種別, 2:陣形]
	const enemyFleetPreset = [
		[],
		castInt($container.find('.cell_type').val()),
		castInt($container.find('.formation').val())
	];

	// 敵艦IDを格納していく
	$container.find('.enemy_content').each((j, ce) => {
		const enemyId = castInt($(ce)[0].dataset.enemyid);
		const ap = castInt($(ce).find('.enemy_ap').text());

		if (enemyId >= 0) {
			enemyFleetPreset[0].push(enemyId);
		}
		// ※直接入力なら制空値を負値にして格納
		else if (ap > 0) {
			enemyFleetPreset[0].push(-ap);
		}
	});

	return enemyFleetPreset;
}

/**
 * よく使う装備リスト更新
 * @param {number} id id
 */
function updatePlaneSelectedHistory(id) {
	// 先頭に挿入
	setting.selectedHistory[0].unshift(id);
	// 100件以降はケツから削る
	setting.selectedHistory[0] = setting.selectedHistory[0].splice(0, 100);
	saveSetting();
}

/**
 * よく使う艦娘リスト更新
 * @param {number} id id
 */
function updateShipSelectedHistory(id) {
	// 先頭に挿入
	setting.selectedHistory[1].unshift(id);
	// 100件以降はケツから削る
	setting.selectedHistory[1] = setting.selectedHistory[1].splice(0, 100);
	saveSetting();
}

/**
 * 結果表示を行う
 */
function drawResult() {
	// 初期化
	$('#rate_table tbody').find('.rate_tr').addClass('d-none disabled_tr');
	$('.progress_area').addClass('d-none disabled_bar').removeClass('d-flex');
	$('.simple_lb_progress').addClass('d-none').removeClass('d-flex');
	$('#fleet_simple_bar').addClass('d-none');

	// 10万回計算できるアラート追加
	const calculateCount = castInt($('#calculate_count').val());
	if (calculateCount < 50000) {
		$('#prev_calculate_count').text(calculateCount);
		$('#calculate_confirm').removeClass('d-none');
	}
	else {
		$('#calculate_confirm').addClass('d-none');
	}

	const loopCount = isDefMode ? 1 : 6;
	let airPowers = [];
	let enemyAirPowers = [];
	let rateList = [];
	if (isDefMode) {
		airPowers.push(resultData.defenseAirPower);
		enemyAirPowers.push(resultData.enemyAirPowers[6]);
		rateList.push(resultData.fleetAirStatus);
	}
	else {
		// ケツに本隊制空値をぶち込む
		airPowers = resultData.landBaseAirPowers;
		airPowers.push(resultData.fleetAirPower);
		// これはそのままでOK
		enemyAirPowers = resultData.enemyAirPowers;
		// ケツに本隊制空状態確率をぶち込む
		rateList = resultData.landBaseAirStatus;
		rateList.push(resultData.fleetAirStatus);
	}
	for (let i = 0; i <= loopCount; i++) {
		// 描画対象先の行インデックス 防空8、他は連番(0は一応ヘッダのため1から)
		const targetRowIndex = isDefMode ? 8 : i + 1;
		const $target_bar = $('#result_bar_' + targetRowIndex);
		const $target_tr = $('#rate_row_' + targetRowIndex);
		const ap = airPowers[i];
		const eap = enemyAirPowers[i];
		const rates = rateList[i];
		const border = getAirStatusBorder(eap);
		let status = isDefMode ? getAirStatusIndex(ap, eap) : rates.indexOf(getArrayMax(rates));
		let width = 0;
		let visible = false;

		// 制空状態毎に基準widthに対する比率
		if (status === 4) width = ap / border[3] * 100 * 0.1;
		else if (status === 3) width = ap / border[2] * 100 * 0.2;
		else if (status === 2) width = ap / border[1] * 100 * 0.45;
		else if (status <= 1) width = ap / border[0] * 100 * 0.9;

		// 基地(含防空) && 双方制空0の場合確保にしてバーは最大
		if (status === 5 && targetRowIndex !== 7) {
			status = 0;
			width = 100;
		}
		// 本隊の場合は撃墜テーブルに従う
		else if (status === 5) {
			const abbr = $('#shoot_down_table').find(`.cond.battle${displayBattle + 1}`).text();
			const airStatus = AIR_STATUS.find(v => v.abbr === abbr);
			if (airStatus) status = airStatus.id;
			if (status === 0) width = 100;
		}

		// 補正
		width = Math.min(100, width);

		// 結果表示バーの描画
		let prevStatus = $target_bar.data('airstatus');
		const barColor = 'bar_status' + status;
		const prevBarColor = 'bar_status' + prevStatus;
		$target_bar
			.removeClass(prevBarColor)
			.addClass(barColor)
			.css({ 'width': `${width}%`, })
			.data('airstatus', status);

		// 各制空状態比率の描画
		$target_tr.find('.rate_td_ap').text(ap);

		// 敵制空値とボーダーの表示
		const $rate_td_eap = $target_tr.find('.rate_td_eap');
		$rate_td_eap.find('.avg_eap').text(eap);
		$rate_td_eap.find('.eap_border').html(`( ${border.slice(0, 4).map(v => v <= ap ? `<b>${v}</b>` : v.toString()).join(' / ')} )`);

		// 総確率から引いていく表示形式で。
		let sumRate = 100;
		for (let j = 0; j < rates.length; j++) {
			$target_tr.find('.rate_td_status' + j).text('-');
			if (isDefMode) $target_tr.find('.rate_td_status' + status).text('100 %');
			else if (rates[j] > 0) {
				// 小数点2桁以降を切り捨て。
				const rate = Math.floor(rates[j] * 1000) / 10;
				// 次の制空状態の確率に何か値があるなら、総確率から引く
				let rateText = 0;
				if (j + 1 < rates.length && rates[j + 1] > 0) {
					rateText = rate;
					sumRate -= rate;
				}
				else {
					rateText = sumRate.toFixed(1);
				}
				$target_tr.find(`.rate_td_status${j}`).text((rateText) + ' %');
				visible = true;
			}
		}

		// データなしの行はバー、比率ともに非表示
		if (visible || (isDefMode && targetRowIndex === 8)) {
			$target_tr.removeClass('d-none disabled_tr');
			$target_bar.closest('.progress_area').addClass('d-flex').removeClass('d-none disabled_bar');
		}

		const exBarColor = 'bar_ex_status' + status;
		// 基地簡易バー　防空時はでっかいやつ
		if (isDefMode) {
			const $bar = $('#simple_lb_def_bar');
			const $e = $bar.find('.result_bar');
			// 前回のステータスを取得
			prevStatus = $e.data('airstatus');
			// 前回のクラスを消して新しくクラスを設定、長さ、設定を整える
			$e.removeClass(`bar_status${prevStatus} bar_ex_status${prevStatus}`)
				.addClass(`${barColor} ${exBarColor}`)
				.css({ 'width': `${width}%`, })
				.data('airstatus', status);
			// 制空状態を表記
			$bar.find('.simple_label').text(AIR_STATUS.find(v => v.id === status).abbr);
			// 表示させる
			$bar.removeClass('d-none');
		}

		// 艦隊簡易バー
		if (targetRowIndex === 7 && visible && status > -1) {
			const $fleetSimpleBar = $('#fleet_simple_bar');
			const $simpleBar = $fleetSimpleBar.find('.result_bar');
			prevStatus = $simpleBar.data('airstatus');
			$simpleBar.removeClass(`bar_status${prevStatus} bar_ex_status${prevStatus}`)
				.addClass(`${barColor} ${exBarColor}`)
				.css({ 'width': `${width}%`, })
				.data('airstatus', status);
			const t = `${AIR_STATUS.find(v => v.id === status).abbr}(${Math.floor(rates[status] * 100)}%)`;
			$fleetSimpleBar.find('.simple_label').text(t);
			$fleetSimpleBar.removeClass('d-none');
		}

		if (isDefMode) break;
	}

	let sumBauxiteAvg = 0;
	let sumBauxiteMax = 0;
	let sumBauxiteMin = 0;
	// 出撃後スロット平均、全滅率の表示
	for (let index = 0; index < resultData.fleetSlots.length; index++) {
		const s = resultData.fleetSlots[index];
		const deathRate = s.deathRate * 100;
		const node_tr = document.getElementById(`s${s.shipNo}sl${s.slot}`);
		if (!node_tr) continue;
		const initSlot = castInt(node_tr.getElementsByClassName('battle1')[0].textContent);
		const node_battle_end = node_tr.getElementsByClassName('battle_end')[0];
		node_battle_end.textContent = Math.round(s.avg);

		const node_battle_death = node_tr.getElementsByClassName('battle_death')[0];
		node_battle_death.textContent = (s.deathRate === 0 ? '-' : deathRate >= 10 ? deathRate.toFixed(1) + ' %' : Math.ceil(deathRate * 10) / 10 + ' %');

		// 1戦目との差分から平均ボーキ消費量を算出
		if (initSlot > 0) {
			sumBauxiteAvg += 5 * (initSlot - s.avg);
			sumBauxiteMax += 5 * (initSlot - s.max);
			sumBauxiteMin += 5 * (initSlot - s.min);
		}
	}

	// 平均鋼材消費量(1でもあれば噴式機ありモードにする)
	if (resultData.usedSteels) {
		// 平均ボーキ & 鋼材 消費量
		const avgSteel = resultData.usedSteels / calculateCount;
		if (!$('.battle_end.fap').html()) $('.battle_end.fap').html('消費予測');
		$('.battle_end.eap').html(`
		<div><img src="../img/util/bauxite.png" class="img-size-18" alt="ボーキサイト">: ${sumBauxiteAvg.toFixed(1)}</div>
		<div><img src="../img/util/steel.png" class="img-size-18" alt="鋼材">: ${avgSteel.toFixed(1)}</div>
		`);
	}
	else {
		// 平均ボーキ消費量
		if (!$('.battle_end.fap').html()) {
			$('.battle_end.fap').html('<img src="../img/util/bauxite.png" class="img-size-18" alt="ボーキサイト">消費予測');
		}
		$('.battle_end.eap').html(`${sumBauxiteMax} ~ ${sumBauxiteMin} ( ${sumBauxiteAvg.toFixed(1)} )`);
	}

	// 敵艦搭載数推移
	for (let i = 0; i < resultData.enemySlots.length; i++) {
		const s = resultData.enemySlots[i];
		const node_tr = document.getElementsByClassName('enemy_no_' + s[0] + ' slot_' + s[1])[0];
		const avg = Math.floor(10 * (s[2] / calculateCount));
		node_tr.getElementsByClassName('td_avg_slot')[0].textContent = (avg === 0 ? '0' : avg / 10);
		node_tr.getElementsByClassName('td_max_slot')[0].textContent = s[3];
		node_tr.getElementsByClassName('td_min_slot')[0].textContent = s[4];
	}

	// 棒立ち率
	if (!isDefMode && document.getElementById('adapt_stage2')['checked']) {
		for (let i = 0; i < resultData.enemySlotAllDead.length; i++) {
			const rate = Math.round(1000 * (resultData.enemySlotAllDead[i] / calculateCount)) / 10;
			const node_tr = document.getElementsByClassName(`enemy_no_${i} slot_0`)[0];
			node_tr.getElementsByClassName('td_all_dead')[0].textContent = Math.floor(rate) + '%';
		}
		document.getElementById('enemy_slot_result_mode').textContent = '（航空戦 stage2 後）';
	}
	else {
		document.getElementById('enemy_slot_result_mode').textContent = '（航空戦 stage1 後）';
	}

	// 敵制空値関連
	const stage1BeforAps = resultData.enemyAirPowerResults[0];
	const stage1AfterAps = resultData.enemyAirPowerResults[1];

	if (stage1BeforAps.length) {
		const dist = getEnemyApDistribution(stage1BeforAps);
		let node = document.getElementById('enemy_ap_bf_dist_min');
		for (const value of dist) {
			node.textContent = value;
			node = node.nextElementSibling;
		}
	}
	if (stage1AfterAps.length) {
		const dist = getEnemyApDistribution(stage1AfterAps);
		let node = document.getElementById('enemy_ap_af_dist_min');
		for (const value of dist) {
			node.textContent = value;
			node = node.nextElementSibling;
		}
	}

	// 基地簡易バーの描画 入力データから描画
	const landBaseAll = inputItems.landBase;
	for (const landBase of landBaseAll.landBases) {

		const wave1 = landBase.target[0];
		const wave2 = landBase.target[1];
		if (wave1 === -1 || wave2 === -1 || isDefMode) {
			continue;
		}

		// ターゲットのうち、先に戦闘が行われる方を描画する
		const displayWave = wave1 <= wave2 ? [wave1, wave2] : [wave2, wave1];
		const resultIndex = wave1 <= wave2 ? [0, 1] : [1, 0];

		for (let j = 0; j <= 1; j++) {
			// ゲージを算出、描画
			const asResult = landBase.results[displayWave[j]].airStatusIndex[resultIndex[j]];
			const avgFap = landBase.results[displayWave[j]].mainAirPower[resultIndex[j]] / calculateCount;
			const avgEap = landBase.results[displayWave[j]].enemyAirPower[resultIndex[j]] / calculateCount;

			// 最も多い制空状態
			let status = asResult.indexOf(getArrayMax(asResult));

			let width = 0;
			const border = getAirStatusBorder(avgEap);

			// 制空状態毎に基準widthに対する比率
			if (status === 4) width = avgFap / border[3] * 100 * 0.1;
			else if (status === 3) width = avgFap / border[2] * 100 * 0.2;
			else if (status === 2) width = avgFap / border[1] * 100 * 0.45;
			else if (status <= 1) width = avgFap / border[0] * 100 * 0.9;

			// 基地(含防空) && 双方制空0の場合確保にしてバーは最大
			if (status === 5) {
				status = 0;
				width = 100;
			}

			const barColor = 'bar_status' + status;
			const exBarColor = 'bar_ex_status' + status;
			const $simpleBarParent = $(`#simple_lb_bar_${landBase.baseNo}_${j + 1}`);
			const $simpleBar = $simpleBarParent.find('.result_bar');
			const prevStatus = $simpleBar.data('airstatus');
			$simpleBar.removeClass(`bar_status${prevStatus} bar_ex_status${prevStatus}`)
				.addClass(`${barColor} ${exBarColor}`)
				.css({ 'width': (width > 100 ? 100 : width) + '%', })
				.data('airstatus', status);

			const statusText = AIR_STATUS.find(v => v.id === status).abbr;
			const v = Math.floor((getArrayMax(asResult) / calculateCount) * 100);
			const vText = v === 100 ? '' : v >= 10 ? `<span class="opacity0">1</span>` : `<span class="opacity0">11</span>`;
			const t = `${statusText}(${v}%)${vText}`;
			$simpleBarParent.find('.simple_label').html(t);
			$simpleBarParent.removeClass('d-none');
		}
	}


	display_result_Changed();

	// 重い気がする奴解放
	resultData.enemyAirPowerResults = null;
	resultData.fleetSlots = null;
}

/**
 * 数値配列から [min 上位50 25 10 5 1 max] 配列を返却
 * @param {number[]} data
 */
function getEnemyApDistribution(data) {
	// 昇順ソート
	data.sort((a, b) => a - b);

	const maxCount = data.length;
	const min = data[0];
	const max = data[data.length - 1];
	let par50 = 0, par75 = 0, par90 = 0, par95 = 0, par99 = 0, sumRate = 0;
	for (let i = min; i <= max; i++) {
		// この値が記録されているインデックスの境界 = 回数[1,1,3,4]
		let count = data.findIndex(v => v > i);
		// なければ次
		if (count === 0) continue;
		else if (count === -1) {
			// ここに入るのは i === maxのとき
			count = data.length;
		}
		else {
			// 余分なものをカット
			data = data.slice(count);
		}
		// 全体に占める割合
		sumRate += 100 * count / maxCount;
		if (!par50 && sumRate >= 50) par50 = i;
		if (!par75 && sumRate >= 75) par75 = i;
		if (!par90 && sumRate >= 90) par90 = i;
		if (!par95 && sumRate >= 95) par95 = i;
		if (!par99 && sumRate >= 99) par99 = i;
	}
	par50 = par50 ? par50 : max;
	par75 = par75 ? par75 : max;
	par90 = par90 ? par90 : max;
	par95 = par95 ? par95 : max;
	par99 = par99 ? par99 : max;
	const array = [min, par50, par75, par90, par95, par99, max];
	return array;
}

/*==================================
		計算用処理
==================================*/
/**
 * 制空値を比較し、制空状態の index を返却
 * @param {number} x ベース制空値
 * @param {number} y 比較対象制空値
 * @returns {number} 制空状態 index (0:確保 1:優勢...)
 */
function getAirStatusIndex(x, y) {
	// 味方艦隊1000以下なら事前計算テーブルから制空状態取得
	if (x <= 1000) {
		const max = AIR_STATUS_TABLE[x].length - 1;
		if (y < max) return AIR_STATUS_TABLE[x][y];
		return 4;
	}
	else {
		const border = getAirStatusBorder(y);
		const len = border.length;
		for (let i = 0; i < len; i++) if (x >= border[i]) return x !== 0 ? i : 4;
	}
}

/**
 * 引数の制空値から、必要な制空状態のボーダーを返却
 * @param {number} enemyAp 基準制空値
 * @returns {number[]} 制空状態ボーダーのリスト [確保ボーダー, 優勢ボーダー, ...]
 */
function getAirStatusBorder(enemyAp) {
	if (enemyAp === 0) return [0, 0, 0, 0, 0];
	return [
		enemyAp * 3,
		Math.ceil(enemyAp * 1.5),
		Math.floor(enemyAp / 1.5) + 1,
		Math.floor(enemyAp / 3) + 1,
		0
	];
}

/**
 * 計算開始
 * 引数でfalseに指定された場合、該当の基地, 艦隊, 敵艦隊を使い回す
 * @param {boolean} [landBaseClear=true] fasleとすると前回のものを使う
 * @param {boolean} [fleetClear=true] fasleとすると前回のものを使う
 * @param {boolean} [enemyClear=true] fasleとすると前回のものを使う
 */
function calculate(landBaseClear = true, fleetClear = true, enemyClear = true) {
	try {
		// 使い回さないオブジェクトをクリア
		if (landBaseClear) inputItems.landBase = null;
		if (fleetClear) inputItems.fleet = null;
		if (enemyClear) inputItems.battleInfo = null;

		// 計算前初期化
		calculateInit();

		// 各状態確率計算
		rateCalculate();

		// 結果表示
		drawResult();
	} catch (error) {
		// ログ送信
		sendErrorLog(error);
	}
}

/**
 * エラーログ送信
 * @param {Object} error エラーオブジェクト
 */
function sendErrorLog(error) {
	errorInfo = {
		name: error.name,
		message: error.message,
		stack: error.stack,
		data: encodePreset(),
		createdAt: firebase.firestore.FieldValue.serverTimestamp(),
		remarks: "",
		version: "1.12.2.1"
	};

	console.log(error);

	const $modal = $('#modal_confirm');
	$modal.find('.modal-body').html(`
		<div>
			<div class="h5">計算処理中にエラーが発生しました。</div>
			<div class="mt-3">
				<div class="pl-3">
					ブラウザのキャッシュの問題で、正しく計算が処理できなかった可能性があります。
				</div>
				<div class="pl-3">
					このまま本画面にてブラウザのスーパーリロードをお試しください。
				</div>
				<div class="pl-2 mt-4">■ スーパーリロードを行ったが改善しない場合</div>
				<div class="pl-3 mt-1">
					大変申し訳ありません。お手数ですが、直前にどのような基地や艦娘の装備などの操作をしようとしたかを<a href="https://odaibako.net/u/noro_006" target="_blank" id="send_error">こちら</a>までご報告ください。
				</div>
				<div class="pl-3 mt-1">
					報告を頂き次第、可能な限り早期の調査、修正を行います。ご不便をおかけして申し訳ありません。
				</div>
			</div>
		</div>
	`);

	confirmType = "Error";
	$modal.modal('show');
}

/**
 * ログを送信
 */
function sendError() {
	if (!fb) initializeFB();
	if (fb) {
		fb.runTransaction(function (tran) {
			const ref = fb.collection('errors');
			const d = ref.doc();
			return tran.get(d).then(async () => {
				await tran.set(d, errorInfo);
			})
		}).then(function (res) {
		}).catch(function (err) {
		});
	}
}

/**
 * 計算前初期化 anti-JQuery
 */
function calculateInit() {
	// 防空時
	if (isDefMode) {
		// 艦娘 & 一般敵情報非表示
		document.getElementById('friendFleet').classList.add('d-none');
		document.getElementById('normal_enemies').classList.add('d-none');
		document.getElementById('display_battle_tab').classList.add('d-none');
		document.getElementById('shoot_down_table_content').classList.add('d-none');
		// 基地空襲敵欄表示
		document.getElementById('air_raid_enemies').classList.remove('d-none');
		document.getElementsByClassName('btn_lb_target')[0].classList.add('d-none');
		document.getElementsByClassName('btn_lb_target')[1].classList.add('d-none');
		document.getElementsByClassName('lb_target_alert')[0].classList.add('d-none');
		document.getElementsByClassName('lb_target_alert')[1].classList.add('d-none');
		// 対空砲火アレコレ全部非表示
		document.getElementById('result_stage2_setting').classList.add('d-none');

		// 戦闘回数固定
		const node = document.getElementById('battle_count_content');
		node.classList.add('d-none');
		node.classList.remove('d-flex');
	}
	else {
		// 艦娘情報表示
		document.getElementById('friendFleet').classList.remove('d-none');
		document.getElementById('normal_enemies').classList.remove('d-none');
		document.getElementById('display_battle_tab').classList.remove('d-none');
		document.getElementById('shoot_down_table_content').classList.remove('d-none');

		// 基地空襲敵欄非表示
		document.getElementById('air_raid_enemies').classList.add('d-none');
		document.getElementsByClassName('btn_lb_target')[0].classList.remove('d-none');
		document.getElementsByClassName('btn_lb_target')[1].classList.remove('d-none');
		// 対空砲火のアレコレ表示
		document.getElementById('result_stage2_setting').classList.remove('d-none');
		if (document.getElementById('adapt_stage2')['checked']) {
			// 対空砲火有効になってるなら => 味方陣形の表示
			document.getElementById('fleet_formation').classList.remove('d-none');
			document.getElementById('fleet_formation_label').classList.remove('d-none');
		}
		else {
			// 対空砲火無効なら => 味方陣形を非表示
			document.getElementById('fleet_formation').classList.add('d-none');
			document.getElementById('fleet_formation_label').classList.add('d-none');
		}

		const node = document.getElementById('battle_count_content');
		node.classList.add('d-flex');
		node.classList.remove('d-none');
	}

	// 入力データの取得 / 反映
	updateInputData();

	// 入力データから各種ステータス情報等を更新
	updateView();

	// ログなど
	const currentData = encodePreset();

	// 現在アクティブなタブの履歴にどうのこうの
	const activePreset = getActivePreset();
	const history = activePreset.history;
	const histories = history.histories;

	const enabled = activePreset.id !== '';

	// 現在値と違う履歴データかチェック
	if (enabled && activePreset.id && histories[history.index] !== currentData) {
		// 現在のundo index 位置より若い履歴を削除
		if (history.index !== 0) {
			histories.splice(0, history.index);
		}
		// 0番目に挿入
		histories.unshift(currentData);

		// 20件制限
		history.histories = histories.splice(0, 20);
		history.index = 0;

		// タブを編集済みに書き換え
		const $tab = $('#fleet_tab_container .active:not(.unsaved)');
		$tab.find('.fleet_tab_icon').html('&#8727;');
		$tab.addClass('unsaved');

		updateActivePreset(activePreset);
	}

	if (enabled && history.index < history.histories.length - 1) {
		document.getElementById('btn_undo').classList.remove('disabled');
		document.getElementById('menu_undo').classList.remove('disabled');
	}
	else {
		document.getElementById('btn_undo').classList.add('disabled');
		document.getElementById('menu_undo').classList.add('disabled');
	}
	if (enabled && history.index > 0) {
		document.getElementById('btn_redo').classList.remove('disabled');
		document.getElementById('menu_redo').classList.remove('disabled');
	}
	else {
		document.getElementById('btn_redo').classList.add('disabled');
		document.getElementById('menu_redo').classList.add('disabled');
	}

	// 空スロット表示可否
	if (setting.emptySlotInvisible !== document.getElementById('empty_slot_invisible')['checked']) {
		setting.emptySlotInvisible = document.getElementById('empty_slot_invisible')['checked'];
		saveSetting();
	}

	// 計算結果データ初期化
	resultData = {
		enemyAirPowers: [],
		enemyAirPowerResults: [],
		enemySlots: [],
		enemySlotAllDead: [],
		landBaseAirPowers: [],
		landBaseAirStatus: [],
		fleetAirPower: 0,
		fleetAirStatus: [],
		fleetSlots: [],
		defenseAirPower: 0,
		usedSteels: 0
	};

	// 事前計算テーブルチェック
	setPreCalculateTable();
}

/**
 * 計算用入力データクラス初期化
 */
function updateInputData() {
	// 初期化
	if (!inputItems) {
		inputItems = new InputData();
	}

	// それぞれ情報が無ければ作成

	// 基地情報更新
	if (!inputItems.landBase) {
		// 艦娘使用機体のみ残して使用機体初期化
		usedItems = usedItems.filter(v => v.parent === "ship");
		inputItems.landBase = createLandBaseInstance();
	}
	else {
		// 前回の結果を初期化
		inputItems.landBase.clearResult();
	}

	// 艦隊情報更新
	if (!inputItems.fleet) {
		// 配備済み艦娘テーブル初期化
		usedShip = [];
		// 基地使用機体のみ残して使用機体初期化
		usedItems = usedItems.filter(v => v.parent === "lb");
		inputItems.fleet = createFleetInstance();
	}
	else {
		inputItems.fleet.clearResult();
	}

	// 敵艦情報更新
	if (!inputItems.battleInfo) {
		inputItems.battleInfo = updateEnemyFleetInfo();
	}
}

/**
 * 表示ステータス等更新
 */
function updateView() {
	updateLandBaseView();
	updateFleetView();
	updateEnemyView();
}

/**
 * 基地航空隊欄表示更新
 */
function updateLandBaseView() {
	const landBaseAll = inputItems.landBase;
	// 半径NG航空隊番号
	const ngLandBaseIndex = [];
	// 各航空隊最上位機体(出撃札のみ対象)
	const topPlanes = []

	for (const landBase of landBaseAll.landBases) {
		// 各種表示欄定義
		// この航空隊のHTMLElement親
		const lb_tab = document.getElementById('lb_item' + landBase.baseNo);
		// 燃料
		const node_fuel = lb_tab.getElementsByClassName('fuel')[0];
		// 弾薬
		const node_ammo = lb_tab.getElementsByClassName('ammo')[0];
		// 鋼材
		const node_steel = lb_tab.getElementsByClassName('steel')[0];
		// ボーキサイト
		const node_bauxite = lb_tab.getElementsByClassName('bauxite')[0];
		// 総制空値
		const node_AP = lb_tab.getElementsByClassName('ap')[0];
		// 制空値内訳
		const node_AP_detail = lb_tab.getElementsByClassName('ap_detail')[0];
		// 半径
		const node_range = lb_tab.getElementsByClassName('range')[0];

		// 計算モードと、お札のモードが一致していない場合は薄くする
		if ((isDefMode && landBase.mode !== 0) || (!isDefMode && landBase.mode !== 2)) {
			lb_tab.classList.add('opacity6');
		}
		else {
			lb_tab.classList.remove('opacity6');
		}

		// 出撃、配備コスト
		drawChangeValue(node_fuel, castInt(node_fuel.textContent), landBase.getSumFuel(), true);
		drawChangeValue(node_ammo, castInt(node_ammo.textContent), landBase.getSumAmmo(), true);
		drawChangeValue(node_bauxite, castInt(node_bauxite.textContent), landBase.getSumBauxite(), true);
		if (landBase.hasJet) {
			drawChangeValue(node_steel, castInt(node_steel.textContent), landBase.getSumSteel(), true);
			node_steel.classList.remove('d-none');
			node_steel.previousElementSibling.classList.remove('d-none');
		}
		else {
			node_steel.classList.add('d-none');
			node_steel.previousElementSibling.classList.add('d-none');
		}

		// 総制空値 それぞれの基地のモード毎によって取得元は可変
		const sumAirPower = landBase.mode === 0 ? landBase.defenseAirPower : landBase.airPower;
		drawChangeValue(node_AP, castInt(node_AP.textContent), sumAirPower);

		// 制空値内訳表示
		const apList = landBase.mode === 0 ? landBase.planes.map(v => v.defenseAirPower) : landBase.planes.map(v => v.airPower);
		if (landBase.reconCorr > 1.0) {
			node_AP_detail.textContent = `( ${apList.join(' / ')} ) × ${landBase.reconCorr}`;
		}
		else {
			node_AP_detail.textContent = `( ${apList.join(' / ')} )`;
		}

		// 半径
		const range = landBase.getRange();
		drawChangeValue(node_range, castInt(node_range.textContent), range);

		// 半径が足りていないなら文言追加
		if (landBase.mode > 0) {
			const node = document.getElementById('battle_container').getElementsByClassName('battle_content');
			const first = landBase.target[0];
			const second = landBase.target[1];
			let hasError = false;

			// 1派目 不正チェック
			if (node.length >= first) {
				let cellRadius = castInt(node[first].getElementsByClassName('enemy_range')[0].textContent);
				const cellData = node[first].dataset.celldata;

				// 噴式機アリ && 6-4ボスマス(N)なら半径緩和(2)
				if (landBase.hasJet && cellData === '64_N') cellRadius = 2;
				hasError = cellRadius > range;
			}

			// 2派目 不正チェック
			if (!hasError && second >= 0 && node.length >= second) {
				let cellRadius = castInt(node[second].getElementsByClassName('enemy_range')[0].textContent);
				const cellData = node[second].dataset.celldata;

				// 噴式機アリ && 6-4ボスマス(N)なら半径緩和(2)
				if (landBase.hasJet && cellData === '64_N') cellRadius = 2;
				hasError = cellRadius > range;
			}

			if (hasError) {
				ngLandBaseIndex.push(landBase.baseNo);
			}
		}

		// 最上位スロット取得 (出撃札のみ)
		if (landBase.mode === 2 && landBase.planes.length > 0) {
			topPlanes.push(landBase.planes[0]);
		}
	}

	// 基地空襲おこした？アラート
	needAirRaidAlert = false;

	// 待機以外の札があるかどうか
	const exists = landBaseAll.landBases.some(v => v.mode !== -1);
	if (exists) {
		if (isDefMode) {

			const def_sum_ap = document.getElementById('def_sum_ap_all');
			const def_sum_ap_ex = document.getElementById('def_sum_ex_ap_all');
			const rocket_c = document.getElementById('rocket_c');
			// 総制空値合計
			landBaseAll.updateDefenseAirPower();
			const sumAp = landBaseAll.defenseAirPower;
			const sumAp_ex = landBaseAll.defense2AirPower;

			// 重爆時の全体的な制空値と補正値
			drawChangeValue(def_sum_ap, castInt(def_sum_ap.textContent), sumAp);
			drawChangeValue(def_sum_ap_ex, castInt(def_sum_ap.textContent), sumAp_ex);
			rocket_c.textContent = landBaseAll.rocketBonus.toString();
		}

		// 半径足りませんよ表示
		document.getElementsByClassName('ng_range')[0].textContent = ngLandBaseIndex.join(', ');
		document.getElementsByClassName('ng_range')[1].textContent = ngLandBaseIndex.join(', ');
		if (ngLandBaseIndex.length) {
			document.getElementsByClassName('lb_range_warning')[0].classList.remove('d-none');
			document.getElementsByClassName('lb_range_warning')[1].classList.remove('d-none');
			// inform_warning(`第${ngLandBaseIndex.join(', ')}基地航空隊の半径が不足しています。`);
		}
		else {
			document.getElementsByClassName('lb_range_warning')[0].classList.add('d-none');
			document.getElementsByClassName('lb_range_warning')[1].classList.add('d-none');
		}

		// 防空部隊がない
		if (!landBaseAll.landBases.some(v => v.mode === 0)) {
			// 一番上の機体が18機か4機
			for (const plane of topPlanes) {
				if ((plane.isRecon && plane.slot === 4) || (!plane.isRecon && plane.slot === 18)) {
					needAirRaidAlert = true;
					break;
				}
			}
		}
	}
	else {
		document.getElementsByClassName('lb_range_warning')[0].classList.add('d-none');
		document.getElementsByClassName('lb_range_warning')[1].classList.add('d-none');
	}

	// 基地入力欄の半径、触接表示有無
	for (const e of document.getElementsByClassName('battle_only')) {
		if (isDefMode) e.classList.add('d-none');
		else e.classList.remove('d-none');
	}

	// 基地入力欄(全親)の防空ステータス表示有無
	if (isDefMode) {
		document.getElementById('defense_summary').classList.remove('d-none');
		document.getElementById('defense_summary').classList.add('d-flex');
	}
	else {
		document.getElementById('defense_summary').classList.remove('d-flex');
		document.getElementById('defense_summary').classList.add('d-none');
	}
}

/**
 * 艦隊隊欄表示更新
 */
function updateFleetView() {
	const fleet = inputItems.fleet;
	const shootDownTable = document.getElementById('shoot_down_table');
	const shootDownTbody = document.getElementById('shoot_down_table_tbody');
	let shipIndex = -1;

	// 艦娘装備撃墜テーブルをいったん全てリセット
	shootDownTable.getElementsByTagName('tbody')[0].innerHTML = "";
	for (const node of shootDownTable.getElementsByTagName('tfoot')[0].getElementsByClassName('td_battle')) {
		node.innerHTML = "";
	}

	// 陣形欄の制御 => ようは連合用の陣形の表示処理 対象は対空砲火モーダル内と計算結果欄の2つ
	$('#fleet_formation').find('option').each((i, e) => {
		const val = castInt($(e).val());
		if (fleet.isUnion && val > 10) $(e).removeClass('d-none');
		else if (!fleet.isUnion && val > 10) $(e).addClass('d-none');
	});
	$('#fleet_antiair_formation').find('option').each((i, e) => {
		const val = castInt($(e).val());
		if (fleet.isUnion && val > 10) $(e).removeClass('d-none');
		else if (!fleet.isUnion && val > 10) $(e).addClass('d-none');
	});

	// 対空砲火ステータスの表示制御
	if (setting.visibleAntiAirStatus) {
		$('.anti_air_status').removeClass('d-none');
		$('.anti_air_status').addClass('d-flex');
	}
	else {
		$('.anti_air_status').addClass('d-none');
		$('.anti_air_status').removeClass('d-flex');
	}

	// 艦隊制空値
	const fleetSumAP1 = document.getElementsByClassName('fleet_ap')[0];
	const fleetSumAP2 = document.getElementsByClassName('fleet_ap')[1];
	const fleetContact1 = document.getElementsByClassName('contact_start_rate')[0];
	const fleetContact2 = document.getElementsByClassName('contact_start_rate')[1];
	const fleetNightContact1 = document.getElementsByClassName('night_contact_rate')[0];
	const fleetNightContact2 = document.getElementsByClassName('night_contact_rate')[1];

	for (const ship of fleet.ships) {
		shipIndex += 1;
		// 各種表示欄定義
		// この航空隊のHTMLElement親
		const ship_tab = document.getElementById(ship.drawTabId);
		// 制空値
		const node_AP = ship_tab.getElementsByClassName('ap')[0];
		// 制空値内訳
		const node_AP_detail = ship_tab.getElementsByClassName('ap_detail')[0];
		// 射程
		const node_range = ship_tab.getElementsByClassName('ship_range')[0];
		// 対地攻撃負可
		const node_taichi = ship_tab.getElementsByClassName('can_attack_lb')[0];
		// 対空砲火-割合
		const node_rate_down = ship_tab.getElementsByClassName('rate_down')[0];
		// 対空砲火-固定
		const node_fix_down = ship_tab.getElementsByClassName('fix_down')[0];
		// 噴進弾幕ラベル
		const node_hunshin = ship_tab.getElementsByClassName('hunshin')[0];
		// 噴進弾幕 発動率
		const node_hunshin_rate = ship_tab.getElementsByClassName('hunshin_rate')[0];
		// 警告文
		const node_hint = ship_tab.getElementsByClassName('has_warning')[0];

		// 撃墜テーブルに表示する数
		let planeCount = 0
		for (const plane of ship.items) {
			if (plane.isPlane && plane.slot > 0) {
				planeCount += 1;
			}
		}

		// 艦娘横の制空値など反映
		drawChangeValue(node_AP, castInt(node_AP.textContent), ship.airPower);

		// 制空値内訳
		if (ship.items.length && ship.airPower) {
			const aps = [];
			for (const plane of ship.items) {
				if (!plane.isExpanded) aps.push(plane.airPower);
			}
			node_AP_detail.classList.remove('d-none');
			node_AP_detail.textContent = `( ${aps.join(' / ')} )`;
		}
		else {
			node_AP_detail.classList.add('d-none');
			node_AP_detail.textContent = '';
		}

		// 対空砲火ステータス
		node_rate_down.textContent = Math.floor(ship.rateDown * 1000) / 10;
		node_fix_down.textContent = ship.fixDown;

		// 噴進弾幕
		if (ship.hunshinRate > 0) {
			node_hunshin_rate.textContent = (ship.hunshinRate * 100).toFixed(1);
			node_hunshin.classList.remove('d-none');
		}
		else {
			node_hunshin.classList.add('d-none');
		}

		// 警告文　あれば。
		if (ship.warningText) {
			node_hint.classList.remove('d-none');
			node_hint.dataset.originalTitle = ship.warningText;
		}
		else {
			node_hint.classList.add('d-none');
		}

		// マスタから取得
		const rawShip = ship.id ? SHIP_DATA.find(v => v.id === ship.id) : null;
		// 射程 装備射程 -> 艦娘射程の優先順
		const shipRange = RANGES.find(v => v.id === Math.max(ship.range, rawShip ? rawShip.range : 0));

		node_range.textContent = shipRange ? shipRange.name : '短';

		if (node_taichi) {
			// 空母かつ対地可能艦爆ナシかつ艦爆あり
			if (rawShip && [7, 11, 18].includes(rawShip.type)
				&& !ship.items.some(v => TAICHI.includes(v.id) && v.slot > 0)
				&& ship.items.some(v => [7, 57].includes(v.type) && v.slot > 0)) {
				node_taichi.classList.remove('d-none');
			}
			else {
				node_taichi.classList.add('d-none');
			}
		}

		if (planeCount > 0) {
			// 撃墜テーブル生成
			const shoot_fragment = document.createDocumentFragment();
			let isFirst = true;

			// 表示スロット設定
			const invisibleEmptySlot = document.getElementById('empty_slot_invisible')['checked'];

			if (rawShip && !invisibleEmptySlot) {
				// 空スロットも表示する場合、マスタのスロット数に変更
				planeCount = rawShip.slot.length;
			}

			let shootTemplate = document.createElement('tr');
			for (let i = 0; i < ship.items.length; i++) {
				const plane = ship.items[i];
				const planeName = plane.name;

				// 艦娘未指定の場合 搭載数 0 または艦載機以外(未装備も当然含む) のスロットは表示しない
				if (!rawShip && (!plane.isPlane || plane.slot === 0)) continue;
				// 艦娘の場合 スロット以上は作らない。ここで終わり
				if (rawShip && i === rawShip.slot.length) break;
				// 艦娘でも非搭載スロットを表示しない場合は抜ける
				if (rawShip && invisibleEmptySlot && (!plane.isPlane || plane.slot === 0)) continue;

				const backCss = getItemCss(plane.itype).replace('css', 'shoot_table');

				if (isFirst) {
					// 撃墜テーブル構築
					const node_battle_tr = document.createElement('tr');
					node_battle_tr.id = `s${ship.shipNo}sl${i}`;
					node_battle_tr.dataset.shipid = !rawShip ? 0 : rawShip.id;
					node_battle_tr.dataset.si = shipIndex;
					node_battle_tr.dataset.slot = i;
					node_battle_tr.dataset.css = backCss + '_hover';

					const node_ship_name_td = document.createElement('td');
					node_ship_name_td.rowSpan = planeCount;
					node_ship_name_td.className = 'td_name align-middle';
					node_ship_name_td.textContent = rawShip ? rawShip.name : '未指定';
					node_battle_tr.appendChild(node_ship_name_td);

					const node_plane_name_td = document.createElement('td');
					node_plane_name_td.className = 'pl-1 td_plane_name align-middle ' + backCss;
					node_plane_name_td.textContent = planeName;
					node_battle_tr.appendChild(node_plane_name_td);
					shootTemplate.appendChild(node_plane_name_td.cloneNode(false));

					// 撃墜テーブル 10戦闘分
					for (let j = 1; j <= 10; j++) {
						const node_battle_td = document.createElement('td');
						node_battle_td.className = `td_battle battle${j} align-middle`;
						node_battle_tr.appendChild(node_battle_td);
						shootTemplate.appendChild(node_battle_td.cloneNode(false));
					}

					const node_battle_end_td = document.createElement('td');
					node_battle_end_td.className = 'td_battle battle_end align-middle';
					node_battle_tr.appendChild(node_battle_end_td);
					shootTemplate.appendChild(node_battle_end_td.cloneNode(false));

					const node_battle_death_td = document.createElement('td');
					node_battle_death_td.className = 'td_battle battle_death align-middle';
					node_battle_tr.appendChild(node_battle_death_td);
					shootTemplate.appendChild(node_battle_death_td.cloneNode(false));

					shoot_fragment.appendChild(node_battle_tr);
				}
				else {
					// shootTemplateの書き換えだけで済ませる
					const new_tr = shootTemplate.cloneNode(true);
					new_tr.id = `s${ship.shipNo}sl${i}`;
					new_tr.dataset.shipid = !rawShip ? 0 : rawShip.id;
					new_tr.dataset.si = shipIndex;
					new_tr.dataset.slot = i;
					new_tr.dataset.css = backCss + '_hover';

					const tdPlaneName = new_tr.getElementsByClassName('td_plane_name')[0];
					tdPlaneName.className = `pl-1 td_plane_name align-middle ${backCss}`;
					tdPlaneName.textContent = planeName;

					shoot_fragment.appendChild(new_tr);
				}
				isFirst = false;
			}
			shootDownTbody.appendChild(shoot_fragment);
		}
	}

	let planes = [];
	for (const ship of fleet.ships) {
		planes = planes.concat(ship.items);
	}

	for (let i = 1; i <= 4; i++) {
		const fleetScout = document.getElementsByClassName('fleet_scout' + i)[0];
		const fleetScout2 = document.getElementsByClassName('fleet_scout' + i)[1];
		// 艦隊防空値
		fleetScout.textContent = fleet.scoutScores[i - 1];
		fleetScout2.textContent = fleet.scoutScores[i - 1];
	}

	// 触接テーブルより、制空権確保時の合計触接率を取得
	const contactRate = createContactTable(planes)[0][4];
	const contactRateN = Math.floor(fleet.nightContactRate() * 1000) / 10;
	if (fleet.isUnion) {
		// 第1艦隊
		fleetSumAP1.textContent = `${fleet.airPower}`;
		fleetContact1.textContent = `${contactRate.toFixed(2)}%`;
		fleetNightContact1.textContent = `${contactRateN}%`;
		// 第2艦隊
		fleetSumAP2.textContent = `${fleet.escortAirPower}`;
		fleetContact2.textContent = `${contactRate.toFixed(2)}%`;
		fleetNightContact2.textContent = `${contactRateN}%`;

	}
	else {
		const avtiveTab = $('.friendFleet_tab.show.active')[0];
		// 表示されている艦隊の制空値
		avtiveTab.getElementsByClassName('fleet_ap')[0].textContent = fleet.airPower;
		avtiveTab.getElementsByClassName('contact_start_rate')[0].textContent = `${contactRate.toFixed(2)}%`;

		// 夜間触接率
		avtiveTab.getElementsByClassName('night_contact_rate')[0].textContent = `${contactRateN}%`;
	}

	// 撃墜テーブルが空っぽ！ => おなさけの1行！
	if (shootDownTbody.getElementsByTagName('tr').length === 0) {
		const node_battle_tr = document.createElement('tr');
		node_battle_tr.className = 's0sl0';

		const node_ship_name_td = document.createElement('td');
		node_ship_name_td.className = 'td_name align-middle';
		node_ship_name_td.textContent = '未選択';
		node_battle_tr.appendChild(node_ship_name_td);

		const node_plane_name_td = document.createElement('td');
		node_plane_name_td.className = 'td_plane_name text-nowrap align-middle text-center';
		node_plane_name_td.textContent = '-';
		node_battle_tr.appendChild(node_plane_name_td);

		for (let j = 1; j <= 10; j++) {
			const node_battle_td = document.createElement('td');
			node_battle_td.className = `td_battle battle${j} align-middle`;
			node_battle_tr.appendChild(node_battle_td);
		}

		const node_battle_end_td = document.createElement('td');
		node_battle_end_td.className = 'td_battle battle_end align-middle';
		node_battle_end_td.textContent = "0";
		node_battle_tr.appendChild(node_battle_end_td);

		shootDownTbody.appendChild(node_battle_tr);
	}
}

/**
 * 艦隊隊欄表示更新
 */
function updateEnemyView() {
	const battleInfo = inputItems.battleInfo;
	let sumAntiAirBonus = 0;
	let battleIndex = 0;
	let hasAntiAirCI = false;
	let containUnknown = false;
	let world = '';
	const cells = [];
	const shootDownTableHTML = [];

	// テーブルいったん全てリセット
	document.getElementById('enemy_shoot_down_table').getElementsByTagName('tbody')[0].innerHTML = "";

	// 表示戦闘index
	const mainBattle = isDefMode ? 0 : displayBattle;

	for (let i = 0; i < battleInfo.battles.length; i++) {
		const battle = battleInfo.battles[i];
		sumAntiAirBonus = 0;

		let enemyNo = 0;
		for (const enemy of battle.enemies) {
			sumAntiAirBonus += enemy.antiAirBonus;

			// 対空CI可能艦がいるかどうか
			if (!hasAntiAirCI && battle.hasAntiAirCI) {
				hasAntiAirCI = true;
			}
			// 不明情報あるかどうか
			if (!containUnknown && battle.containUnknown) {
				containUnknown = true;
			}

			// 表示戦闘でないので飛ばし
			if (i !== mainBattle) continue;
			if (enemy.onlyScout || !enemy.slots.length) continue;

			// 撃墜テーブルの初期化
			let enemy_name_td_text = '';
			let enemy_tr_text = '';
			let isFirst = true;
			let slotIndex = -1;
			for (let j = 0; j < enemy.equipments.length; j++) {
				const item = ENEMY_ITEM.find(v => v.id === enemy.equipments[j].id);
				if (!item || !PLANE_TYPE.includes(item.type)) continue;

				slotIndex += 1;
				const slotNum = enemy.slots[slotIndex];
				const backCss = getItemCss(item.itype).replace('css', 'shoot_table');
				const isLastSlot = slotIndex === enemy.slots.length - 1 ? ' last_slot' : '';
				let col_header_text = '';
				let detail_td_text = '';
				let death_td_text = '';

				// 機体画像
				enemy_name_td_text += `<img src="../img/plane/${item.id}.png" class="img-size-36" data-planeid="${item.id}">`;

				if (isFirst) {
					// 先頭行限定のtd
					col_header_text = `
					<td class="td_name align-middle last_slot" rowspan="${enemy.slots.length}">
						<div>${drawEnemyGradeColor(enemy.name)}</div>
						<div class="d-none d-md-block">xxPxx</div>
					</td>`;
					death_td_text = `<td class="td_all_dead align-middle last_slot" rowspan="${enemy.slots.length}"></td>`;
					detail_td_text = `<td class="td_detail_slot align-middle last_slot" rowspan="${enemy.slots.length}"><i class="fas fa-file-text"></i></td>`;

					isFirst = false;
				}

				enemy_tr_text += `
				<tr class="enemy_no_${enemyNo} slot_${slotIndex}" data-rowindex="${enemyNo}" data-slot="${slotIndex}" data-css="${backCss}_hover">
					${col_header_text}
					<td class="pl-1 td_plane_name align-middle ${backCss + isLastSlot}">${item.name}</td>
					<td class="td_init_slot align-middle${isLastSlot}">${slotNum}</td>
					<td class="td_avg_slot align-middle${isLastSlot}">${slotNum}</td>
					<td class="td_max_slot align-middle${isLastSlot}">${slotNum}</td>
					<td class="td_min_slot align-middle${isLastSlot}">${slotNum}</td>
					${isDefMode ? '' : death_td_text}
					${isDefMode ? '' : detail_td_text}
				</tr>`;
			}

			shootDownTableHTML.push(enemy_tr_text.replace('xxPxx', enemy_name_td_text));
			enemyNo += 1;
		}

		// 戦闘情報表示欄
		const battle_tab = !isDefMode ? document.getElementsByClassName('battle_content')[battleIndex++] : document.getElementById('battle_content_def_mode');
		// 制空値
		battle_tab.getElementsByClassName('enemy_sum_ap')[0].textContent = battle.getAirPower();
		// 基地制空値
		battle_tab.getElementsByClassName('enemy_sum_lbap')[0].textContent = battle.getLandBaseAirPower();
		if (isDefMode) {

		}
		// 半径(既に値が入っているので、0なら非表示)
		const node_range = battle_tab.getElementsByClassName('enemy_range')[0];
		if (!castInt(node_range.textContent)) node_range.parentNode.classList.add('d-none');
		else node_range.parentNode.classList.remove('d-none');

		// 艦隊防空
		const form = FORMATION.find(v => v.id === battle.formation);
		const cor = form ? form.correction : 1.0;
		battle_tab.getElementsByClassName('fleet_AA')[0].textContent = Math.floor(cor * sumAntiAirBonus) * 2;

		// 航路情報を取得　なければ手動
		const str = battle_tab.dataset.celldata;
		const array = str ? str.split('_') : ['', ''];
		if (array.length) {
			if (!world) {
				// 初回の海域を格納　以降、一度でも違う海域が来たら混在とする
				world = array[0];
			}
			else if (world !== array[0]) {
				world = '海域混在';
			}

			if (array.length > 1) {
				cells.push(array[1]);
			}
		}
	}

	if (world !== '' || world !== '海域混在') {
		const worldtext = world.slice(0, -1) > 40 ? 'E-' : world.slice(0, -1) + '-';
		document.getElementById('route').textContent = worldtext + world.slice(-1) + ' : ' + cells.join(' → ');
	}
	else {
		document.getElementById('route').textContent = world;
	}

	// 基地空襲を促す
	if (!isDefMode && needAirRaidAlert && AIR_RAID_MAP.includes(castInt(world))) {
		document.getElementById('air_raid_alert').classList.remove('d-none');
	}
	else {
		document.getElementById('air_raid_alert').classList.add('d-none');
	}

	const cutinAlert = document.getElementById('enemy_cutin_contain');
	if (cutinAlert) {
		if (hasAntiAirCI) {
			cutinAlert.classList.remove('d-none');
		}
		else {
			cutinAlert.classList.add('d-none');
		}
	}

	const unknownAlert = document.getElementById('unknown_enemy_contain');
	if (unknownAlert) {
		if (containUnknown) {
			unknownAlert.classList.remove('d-none');
		}
		else {
			unknownAlert.classList.add('d-none');
		}
	}

	if (!shootDownTableHTML.length) {
		shootDownTableHTML.push(`<tr><td colspan="8">戦闘機、攻撃機を搭載した敵艦がいない戦闘です。</td></tr>`);
	}
	else {
		document.getElementById('enemy_shoot_down_tbody').innerHTML = shootDownTableHTML.join('\r\n');
	}

	if (!isDefMode && document.getElementById('adapt_stage2')['checked']) {
		$('.td_all_dead').removeClass('d-none');
		document.getElementById('enabled_manual_stage2')['checked'] = true;
		document.getElementById('aa_cutin_miss').parentElement.classList.remove('d-none');
	}
	else {
		$('.td_all_dead').addClass('d-none');
		document.getElementById('enabled_manual_stage2')['checked'] = false;
		document.getElementById('aa_cutin_miss').parentElement.classList.add('d-none');
	}

	if (!isDefMode) {
		$('.td_detail_slot').removeClass('d-none');
	}
	else {
		$('.td_detail_slot').addClass('d-none');
	}
}

/**
 * 基地航空隊入力情報更新
 * 値の表示と制空値、半径計算も行う
 * @returns {LandBaseAll} 生成された基地クラス
 */
function createLandBaseInstance() {
	const tmpLbPlanes = [];
	const landBaseAll = new LandBaseAll();
	const nodes_lb_tab = document.getElementsByClassName('lb_tab');
	for (let index = 0; index < nodes_lb_tab.length; index++) {
		const node_lb_tab = nodes_lb_tab[index];
		const lbNo = index + 1;
		tmpLbPlanes.length = 0;
		const landBase = new LandBase(lbNo, -1);

		// 基地航空隊 各種制空値表示
		const node_lb_planes = node_lb_tab.getElementsByClassName('lb_plane');
		for (let i = 0; i < node_lb_planes.length; i++) {
			const node_lb_plane = node_lb_planes[i];
			const slotNo = i + 1;
			if (i >= 4) break;

			const id = castInt(node_lb_plane.dataset.planeid);
			const remodel = castInt(node_lb_plane.getElementsByClassName('remodel_value')[0].textContent);
			const level = castInt(node_lb_plane.getElementsByClassName('prof_select')[0].dataset.prof);
			// スロット数取得(入力値 不正な可能性あり)
			const node_slot = node_lb_plane.getElementsByClassName('slot')[0];
			const plane = new LandBaseItem(id, castInt(node_slot.textContent), remodel, level);
			// スロット審査されてるのでそれを再設定
			node_slot.textContent = plane.slot;

			plane.slotNo = slotNo;

			if (plane.id > 0) {
				// 機体を追加
				landBase.planes.push(plane);

				// 噴式あれば
				if (!landBase.hasJet && plane.isJet) {
					landBase.hasJet = true;
				}
			}

			// 機体使用数テーブル更新
			let usedData = usedItems.find(v => v.id === plane.id);
			if (usedData) usedData.num[plane.remodel] += 1;
			else {
				usedData = { id: plane.id, num: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], parent: "lb" };
				usedData.num[plane.remodel] += 1;
				usedItems.push(usedData);
			}
		}

		// 機体がない場合は、待機に強制的に変更
		if (!landBase.planes.some(v => v.id > 0)) {
			landBase.mode = -1;
			node_lb_tab.getElementsByClassName('ohuda_select')[0].value = -1;
		}

		// 出撃札状況の取得
		landBase.mode = castInt(node_lb_tab.getElementsByClassName('ohuda_select')[0].value);

		// 派遣先の取得 出撃札の時だけ
		if (landBase.mode === 2) {
			// タゲの値自体は、hidden値から取得　モーダル展開イベント時にボタンは光らせる
			const target1 = castInt(document.getElementById(`lb${lbNo}_target_1`).value);
			const target2 = castInt(document.getElementById(`lb${lbNo}_target_2`).value);
			const lastBattle = battleCount - 1;
			// 1派目
			if (target1 <= lastBattle) {
				landBase.target[0] = target1 >= 0 ? target1 : lastBattle;
			}
			else {
				// 最終戦闘をオーバーしてたら最終戦闘に合わせる
				landBase.target[0] = lastBattle;
			}

			// 2派目
			if (target2 <= lastBattle) {
				landBase.target[1] = target2 >= 0 ? target2 : lastBattle;
			}
			else {
				// 最終戦闘をオーバーしてたら最終戦闘に合わせる
				landBase.target[1] = lastBattle;
			}

			// 分散ならtrue
			landBase.isSeparate = landBase.target[0] !== landBase.target[1];
		}

		// 制空値を更新
		if (landBase.mode === 0) {
			landBase.updateDefenseAirPower();
		}
		else {
			landBase.updateAirPower();
			landBase.fullAirPower = landBase.airPower;
		}

		// 生成した航空隊データを格納
		landBaseAll.landBases.push(landBase);
	}
	return landBaseAll;
}

/**
 * 低い方の内部熟練度を返す　設定次第で最大は120になる
 * @param {number} level 熟練度レベル
 * @param {number} type 機体カテゴリ
 */
function getInnerProficiency(level, type) {
	switch (level) {
		case 7:
			return initialProf120Plane.includes(Math.abs(type)) ? 120 : 100;
		case 0:
			return 0;
		case 1:
			return 10;
		case 2:
			return 25;
		case 3:
			return 40;
		case 4:
			return 55;
		case 5:
			return 70;
		case 6:
			return 85;
		default:
			return 0;
	}
}

/**
 * 航空隊の制空補正値を返却
 * @param {*} plane
 * @param {boolean} [isDefence=false] 防空時の補正が必要な場合true
 * @returns 補正倍率
 */
function getReconnaissancesAdjust(plane, isDefence = false) {
	// 出撃時補正 陸偵
	if (!isDefence && plane.type === 49) {
		// 陸上偵察機補正
		return (plane.scout === 9 ? 1.18 : plane.scout === 8 ? 1.15 : 1.00);
	}
	// 防空時補正
	else if (isDefence) {
		if (plane.type === 49) {
			// 陸上偵察機補正
			return (plane.scout === 9 ? 1.24 : 1.18);
		}
		else if (plane.type === 9) {
			// 艦上偵察機補正
			return (plane.scout > 8 ? 1.3 : 1.2);
		}
		else if ([10, 41].includes(plane.type)) {
			// 水上偵察機補正
			return (plane.scout > 8 ? 1.16 : plane.scout === 8 ? 1.13 : 1.1);
		}
	}

	return 1.0;
}

/**
 * 機体オブジェクトから触接選択率を返却 [0:確保時, 1:優勢時, 2:劣勢時]
 * @param {*} plane オブジェクト
 */
function getContactSelectRate(plane) {
	// 触接選択率　改式。実際はこっち [3, 2, 1].map(v => plane.scout / (20 - (2 * v)));
	if ([8, 9, 10, 41, 49].includes(plane.type)) {
		let scout = plane.scout;
		const remodel = plane.remodel;

		switch (plane.id) {
			case 102:
				// 九八式水上偵察機(夜偵)
				scout = Math.ceil(scout + 0.1 * remodel);
				break;
			case 25:  // 零式水上偵察機
			case 138:	// 二式大艇
			case 163:	// Ro.43水偵
			case 304:	// S9 Osprey
			case 370:	// Swordfish Mk.II改(水偵型)
			case 239:	// 零式水上偵察機11型乙(熟練)
				scout = Math.ceil(scout + 0.14 * remodel);
				break;
			case 59:
				// 零式水上観測機
				scout = Math.ceil(scout + 0.2 * remodel);
				break;
			case 61:
				// 二式艦上偵察機
				scout = Math.ceil(scout + 0.25 * remodel);
				break;
			case 151:
				// 試製景雲(艦偵型)
				scout = Math.ceil(scout + 0.4 * remodel);
				break;
			default:
				break;
		}

		return [scout / 14, scout / 16, scout / 18];
	}
	return [];
}

/**
 * 艦娘入力情報更新
 * 値の表示と制空値計算も行う
 * @returns {Fleet} 艦隊情報クラス
 */
function createFleetInstance() {
	let node_ship_tabs = null;
	const maxShipCount = getMaxShipCount();
	const fleet = new Fleet();

	// 提督レベル
	fleet.adminLevel = castInt($('#admin_lv').val());

	// 連合艦隊モードかどうか
	const isUnionFleet = $('#union_fleet').prop('checked');
	fleet.isUnion = isUnionFleet;

	if (fleet.isUnion) {
		// 連合艦隊モードの場合、全艦を対象とする
		node_ship_tabs = document.getElementsByClassName('ship_tab');
	}
	else {
		// 非連合艦隊モードの場合、表示されている艦隊を対象とする
		node_ship_tabs = $('.friendFleet_tab.show.active')[0].getElementsByClassName('ship_tab');
	}
	saveSetting();

	for (let index = 0; index < node_ship_tabs.length; index++) {
		const node_ship_tab = node_ship_tabs[index];
		let shipNo = index + 1;
		if (isUnionFleet && shipNo > 6) {
			// 遊撃部隊追加により、艦配置番号に補正を入れる => 遊撃部隊分の入力欄で艦隊入力欄番号がずれてるので1戻す
			shipNo -= 1;
		}

		const shipId = castInt(node_ship_tab.dataset.shipid);
		const level = castInt(node_ship_tab.getElementsByClassName('ship_level')[0].textContent);
		const area = castInt(node_ship_tab.getElementsByClassName('area')[0].textContent);
		if (shipId) usedShip.push({ id: shipId, lv: level, area: area });
		// 非表示 / 無効 なら飛ばす
		if (node_ship_tab.classList.contains('d-none') || node_ship_tab.getElementsByClassName('ship_disabled')[0].classList.contains('disabled') || node_ship_tab.classList.contains('ui-draggable-dragging')) continue;

		const shipInstance = new Ship(shipNo);
		shipInstance.id = shipId;
		shipInstance.name = shipId > 0 ? node_ship_tab.getElementsByClassName('ship_name_span')[0].textContent : '';
		shipInstance.drawTabId = node_ship_tab.id;

		// 艦種
		shipInstance.type = castInt(node_ship_tab.dataset.shiptype);
		shipInstance.type2 = castInt(node_ship_tab.dataset.shiptype2);

		// 練度
		shipInstance.level = level;
		// 素対空値
		shipInstance.antiAir = castInt(node_ship_tab.getElementsByClassName('aa')[0].textContent);
		// 運
		shipInstance.luck = castInt(node_ship_tab.getElementsByClassName('ship_luck')[0].textContent);

		// 索敵算出
		const maxScout = castInt(node_ship_tab.getElementsByClassName('max_scout')[0].textContent);
		const minScout = castInt(node_ship_tab.getElementsByClassName('min_scout')[0].textContent);
		if (level === 99 && maxScout > 0) {
			// Lv99ステ
			shipInstance.scout = maxScout;
		}
		else if (maxScout > 0) {
			// Lv99以外 算出可能な場合
			shipInstance.scout = Math.floor((maxScout - minScout) * (level / 99) + minScout);
		}
		else {
			// 算出不可
			shipInstance.scout = 0;
		}

		// 装備射程
		let planeRange = 0;
		let slotNo = 0;
		for (const node_ship_plane of node_ship_tab.getElementsByClassName('ship_plane')) {
			// draggable部分 非表示部分は飛ばす
			if (node_ship_plane.classList.contains('ui-draggable') || node_ship_plane.classList.contains('d-none')) continue;
			// 機体オブジェクト生成
			const id = castInt(node_ship_plane.dataset.planeid);
			const remodel = castInt(node_ship_plane.getElementsByClassName('remodel_value')[0].textContent);
			const level = castInt(node_ship_plane.getElementsByClassName('prof_select')[0].dataset.prof);
			const slot_node = node_ship_plane.getElementsByClassName('slot')[0];
			const plane = new ShipItem(id, castInt(slot_node.textContent), remodel, level);
			// スロット審査されてるので再設定
			slot_node.textContent = plane.slot;

			plane.slotNo = slotNo++;

			shipInstance.items.push(plane);

			// 機体を検知したら無視フラグを落とす
			if (shipInstance.ignoreSlot && plane.isPlane) {
				shipInstance.ignoreSlot = false;
			}

			// 射程
			if (planeRange < plane.range) {
				planeRange = plane.range;
			}
			// SGレーダー(初期型) + アメリカ駆逐 雪風改以降は射程長
			if (plane.id === 315 && [396, 1492, 428, 429, 361, 362, 1481, 1489, 451, 456].includes(shipId)) {
				planeRange = 3;
			}

			// ジェット機持ちかどうか
			if (!fleet.hasJet && plane.isJet) {
				fleet.hasJet = true;
			}

			// 補強増設？
			plane.isExpanded = node_ship_plane.classList.contains('expanded_slot');

			// 機体使用数テーブル更新
			let usedData = usedItems.find(v => v.id === plane.id);
			if (usedData) usedData.num[plane.remodel] += 1;
			else {
				usedData = { id: plane.id, num: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], parent: "ship" };
				usedData.num[plane.remodel] += 1;
				usedItems.push(usedData);
			}
		}

		// 対空砲火情報の更新
		shipInstance.updateAntiAirStatus();

		// 連合設定 かつ 6番目以降
		shipInstance.isEscort = isUnionFleet && shipNo > maxShipCount;

		// 艦娘が配備されているか　もしくは装備がなんらか1つでもあれば追加
		if (shipInstance.id > 0 || shipInstance.items.some(v => v.id > 0)) {
			fleet.ships.push(shipInstance);
		}
		else {
			// なければ諸々の表示をクリア
			node_ship_tab.getElementsByClassName('ap')[0].textContent = '-';
			node_ship_tab.getElementsByClassName('ap_detail')[0].textContent = '';
			node_ship_tab.getElementsByClassName('ship_range')[0].textContent = '-';
			node_ship_tab.getElementsByClassName('rate_down')[0].textContent = '-';
			node_ship_tab.getElementsByClassName('fix_down')[0].textContent = '-';
			node_ship_tab.getElementsByClassName('hunshin_rate')[0].textContent = '-';
		}

		// 制空値更新
		shipInstance.updateAirPower();
		shipInstance.initFullAirPower();

		// 射程上書き
		if (shipInstance.range < planeRange) {
			shipInstance.range = planeRange;
		}

		// 伊勢日向飛龍蒼龍の改二 二式艦上偵察機で射程バフ+1
		if ([353, 354, 196, 197].includes(shipInstance.id) && shipInstance.items.some(v => v.id === 61)) {
			if (shipInstance.range < 1) shipInstance.range += 1;
			shipInstance.range += 1;
		}

		// 装備ボーナス(索敵値)
		shipInstance.updateEquipmentBonusScout();
	}

	// 艦隊制空値更新
	fleet.updateAirPower();
	fleet.initFullAirPower();

	// 対空砲火情報の仮設置
	fleet.updateStage2All();

	// 索敵スコアの計算
	fleet.updateScoutScores();

	// 航空戦ボーナス雷装値の計算
	fleet.updateBonusTorpedo()

	return fleet;
}

/**
 * 味方艦隊から触接テーブル生成
 * @param {Item[]} planes
 * @returns
 */
function createContactTable(planes) {
	let sumCotactValue = 0;
	// 補正率別　触接選択率テーブル[ 0:確保時, 1:優勢時, 2:劣勢時 ]
	const contact120 = [[], [], []];
	const contact117 = [[], [], []];
	const contact112 = [[], [], []];

	// データ読み取り
	for (const plane of planes) {
		if (plane.id === 0 || !plane.selectRate.length) continue;

		sumCotactValue += plane.contact;
		for (let i = 0; i < 3; i++) {
			if (plane.accuracy >= 3) contact120[i].push(plane.selectRate[i]);
			else if (plane.accuracy === 2) contact117[i].push(plane.selectRate[i]);
			else contact112[i].push(plane.selectRate[i]);
		}
	}
	const a = Math.floor(sumCotactValue) + 1;
	// 開始触接率ズ [ 0:確保時, 1:優勢時, 2:劣勢時 ] 改式: int(sum(索敵 * sqrt(搭載)) + 1) / (70 - 15 * c)
	const contactStartRate = [
		Math.min(a / 25, 1),
		Math.min(a / 40, 1),
		Math.min(a / 55, 1)
	];

	// 実触接率actualContactRate = [ 0:確保, 1:優勢, 2:劣勢 ] それぞれの要素内に [ 120%, 117%, 112% ]が入る
	const actualContactRate = [[], [], []];
	let sum = 1;
	for (let i = 0; i < 3; i++) {
		let tmpRate = contactStartRate[i];
		// 補正のデカいものから優先的に
		if (contact120[i].length) {
			sum = 1;
			// 全て選択されない確率の導出
			for (const rate of contact120[i]) sum *= (1 - rate);
			// 選択率
			const rate = tmpRate * (1 - sum);
			actualContactRate[i].push(rate);
			tmpRate -= rate;
		}
		else actualContactRate[i].push(0);

		if (contact117[i].length) {
			sum = 1;
			for (const rate of contact117[i]) sum *= (1 - rate);
			const rate = tmpRate * (1 - sum);
			actualContactRate[i].push(rate);
			tmpRate -= rate;
		}
		else actualContactRate[i].push(0);

		if (contact112[i].length) {
			sum = 1;
			for (const rate of contact112[i]) sum *= (1 - rate);
			const rate = tmpRate * (1 - sum);
			actualContactRate[i].push(rate);
		}
		else actualContactRate[i].push(0);
	}

	const contactTable = [[], [], []];
	for (let i = 0; i < 3; i++) {
		contactTable[i].push(100 * contactStartRate[i]);
		contactTable[i] = contactTable[i].concat(actualContactRate[i].map(v => 100 * v));
		contactTable[i].push(Math.min(100 * getArraySum(actualContactRate[i]), 100));
	}
	return contactTable;
}

/**
 * 敵艦隊入力情報読み込み、生成
 * @returns {BattleData}
 */
function updateEnemyFleetInfo() {
	const battleData = new BattleData();

	for (let node_battle_content of document.getElementsByClassName('battle_content')) {
		// 防空時は専用のフォームから。
		if (isDefMode) node_battle_content = document.getElementById('air_raid_enemies');
		if (isDefMode && battleData.battles.length > 0) break;

		// 非表示なら飛ばす
		if (node_battle_content.classList.contains('d-none')) continue;

		const battle = new Battle();
		let isAllSubmarine = true;

		// マス戦闘形式格納
		const cellType = castInt(node_battle_content.getElementsByClassName('cell_type')[0].value);
		battle.cellType = cellType;
		// 連合フラグ
		battle.isUnion = cellType === CELL_TYPE.grand;
		// 戦闘形式による敵対空砲火の有効フラグ
		if (cellType === CELL_TYPE.normal || cellType === CELL_TYPE.aerialCombat || battle.isUnion) {
			battle.enabledStage2 = true;
		}

		// 敵情報取得
		for (const node_enemy_content of node_battle_content.getElementsByClassName('enemy_content')) {
			let enemyId = castInt(node_enemy_content.dataset.enemyid);
			let enemyIndex = castInt(node_enemy_content.getElementsByClassName('enemy_index')[0].dataset.index);
			const enemy = new Enemy(enemyId);
			// 非表示の敵は飛ばす
			if (node_enemy_content.classList.contains('d-none')) continue;

			// 連合以外で6隻埋まってたら終了
			if (!battle.isUnion && battle.enemies.length === 6) break;

			// 潜水以外が含まれていればAll潜水フラグを落とす
			if (isAllSubmarine && enemy.id && !enemy.type.includes(18)) {
				isAllSubmarine = false;
			}
			// 途中で死ぬフラグ
			enemy.isDead = node_enemy_content.classList.contains('is_dead');

			// 連合かつ7番目以降で随伴フラグ
			enemy.isEscort = battle.isUnion && enemyIndex > 6;

			// 対空CI可能艦がいるかどうか
			if (!battle.hasAntiAirCI && ANTIAIR_CUTIN_ENEMY.includes(enemy.id)) {
				battle.hasAntiAirCI = true;
			}
			// 制空不明なやつがいるかどうか
			if (!battle.containUnknown && UNKNOWN_ENEMY.includes(enemy.id)) {
				battle.containUnknown = true;
			}

			battle.enemies.push(enemy);
		}

		// 潜水マスフラグを持たせる
		if (battle.enemies.length) {
			battle.isAllSubmarine = isAllSubmarine;
		}

		// 陣形補正
		battle.formation = castInt(node_battle_content.getElementsByClassName('formation')[0].value);
		// 対空砲火計算
		battle.createStage2Table();

		// 戦闘情報に追加
		battleData.battles.push(battle);
	}

	return battleData;
}

/**
 * 敵機撃墜処理 (繰り返し用)
 * @param {number} index 制空状態
 * @param {Enemy[]} enemyFleet 撃墜対象の敵艦隊
 * @param {boolean} [adaptStage2=false] 対空砲火計算の有効
 * @param {FleetStage2[]} [stage2Tables=[]] 撃墜テーブル
 */
function shootDownEnemy(index, enemyFleet, adaptStage2 = false, stage2Tables = []) {
	// 対空CIの選択
	let pickRate = 0;
	let tableIndex = 0;
	let stage2 = null;
	let range = 0;
	if (adaptStage2) {
		pickRate = Math.random();
		tableIndex = stage2Tables.findIndex(v => v.border > pickRate);
		stage2 = tableIndex >= 0 ? stage2Tables[tableIndex].table : [];
		range = stage2.length;
	}

	const max_i = enemyFleet.length;
	for (let i = 0; i < max_i; i++) {
		const enemy = enemyFleet[i];
		const max_j = enemy.slots.length;
		enemy.airPower = 0;
		enemy.landBaseAirPower = 0;
		let sumAp = 0;
		for (let j = 0; j < max_j; j++) {
			let slot = enemy.slots[j];
			// stage1 撃墜
			enemy.slots[j] -= getShootDownSlot(index, slot);

			// stage2 撃墜 するしない 攻撃機ならする
			if (enemy.attackers[j] && adaptStage2 && range > 0) {
				slot = enemy.slots[j];
				// 迎撃担当選出
				const table = stage2[Math.floor(Math.random() * range)];
				// 割合撃墜　50% で失敗
				if (Math.random() >= 0.5) slot -= Math.floor(table.rateDown * slot);
				// 固定撃墜　50% で失敗
				if (Math.random() >= 0.5) slot -= table.fixDown;
				// 最低保証
				slot -= table.minimumDown;
				// 0未満になったら修正
				enemy.slots[j] = slot > 0 ? slot : 0;
			}
			// 新しい制空値よ
			sumAp += Math.floor(enemy.antiAirs[j] * Math.sqrt(enemy.slots[j]));
		}

		// 制空値の更新
		enemy.landBaseAirPower = sumAp;
		if (!enemy.onlyScout) enemy.airPower = sumAp;
	}
}

/**
 * 引数の制空状態、搭載数をもとに撃墜数を返却 撃墜数はランダム
 * @param {number} index 制空状態インデックス
 * @param {number} slot 撃墜前搭載数
 * @returns {number} 撃墜数
 */
function getShootDownSlot(index, slot) {
	// 撃墜テーブルから撃墜数を取得 インデックスは0から順に 121 81 49 25 4 1
	const range = [121, 81, 49, 25, 4, 1][index];
	return SHOOT_DOWN_TABLE_ENEMY[slot][index][Math.floor(Math.random() * range)];
}

/**
 * 引数の制空状態、搭載数をもとに撃墜後の搭載数を返却 撃墜数はランダム
 * @param {number} index 制空状態インデックス
 * @param {number} slot 撃墜前搭載数
 * @returns {number} 撃墜後搭載数(整数)
 */
function getShootDownSlotFF(index, slot) {
	// 制空定数c = 順に 1, 3, 5, 7, 10
	const c = [1, 3, 5, 7, 10][index];
	// A = 0 ~ (制空定数c/3)の乱数
	const a = Math.floor(Math.random() * (((c / 3) * 1000) + 1)) / 1000;
	// slot * (A + 制空定数c / 4) / 10
	return slot * (a + c / 4) / 10;
}

/**
 * 基地噴式強襲
 * @param {LandBase} landBase 基地
 * @param {Battle} battleInfo 敵艦隊
 */
function doLandBaseJetPhase(landBase, battleInfo) {
	const range = battleInfo.stage2[0][0].length;

	if (!landBase.hasJet || !range || landBase.mode !== 2) {
		return;
	}

	let sumAp = 0;
	for (let j = 0; j < landBase.planes.length; j++) {
		const plane = landBase.planes[j];
		// 噴式以外は制空値だけ加算して飛ばす
		if (!plane.isJet) {
			sumAp += plane.airPower;
			continue;
		}

		// 噴式強襲st1
		// st1 0.6掛け
		plane.slot -= Math.floor(0.6 * getShootDownSlotFF(0, Math.round(plane.slot)));

		// 噴式強襲st2
		// 迎撃担当インデックス
		const index = Math.floor(Math.random() * range);
		// 割合撃墜 50% で失敗
		if (Math.random() >= 0.5) plane.slot -= Math.floor(battleInfo.stage2[plane.avoid][0][index] * plane.slot);
		// 固定撃墜 50% で失敗
		if (Math.random() >= 0.5) plane.slot -= battleInfo.stage2[plane.avoid][1][index];

		plane.updateAirPower();
		sumAp += plane.airPower;
	}

	// この航空隊の制空値を再計算
	landBase.airPower = Math.floor(sumAp * landBase.reconCorr);
}

/**
 * 噴式強襲
 * @param {Fleet} fleet 味方艦隊
 * @param {Battle} battleInfo 敵艦隊
 * @returns 使った鋼材の量
 */
function doJetPhase(fleet, battleInfo) {
	const range = battleInfo.stage2[0][0].length;
	// 戦闘マスが通常/連合戦闘マスじゃないなら強襲なし　ALL潜水も除外
	if (!fleet.hasJet || !battleInfo.enabledStage2 || battleInfo.isAllSubmarine || !range) return 0;
	let steel = 0;
	const shipCount = fleet.ships.length;
	for (let i = 0; i < shipCount; i++) {
		const ship = fleet.ships[i];
		const itemCount = ship.items.length;
		if (ship.ignoreSlot) continue;
		for (let j = 0; j < itemCount; j++) {
			const plane = ship.items[j];
			// 噴式以外は飛ばす
			if (!plane.isJet) continue;
			// 鋼材のお支払い
			steel += Math.round(plane.slot * plane.cost * 0.2);

			// 噴式強襲st1
			// st1 0.6掛け
			plane.slot -= Math.floor(0.6 * getShootDownSlotFF(0, plane.slot));

			// 噴式強襲st2
			const stage2 = battleInfo.stage2[plane.avoid];
			// 迎撃担当インデックス
			const index = Math.floor(Math.random() * range);
			// 割合撃墜 50% で失敗
			if (Math.random() >= 0.5) plane.slot -= Math.floor(stage2[0][index] * plane.slot);
			// 固定撃墜 50% で失敗
			if (Math.random() >= 0.5) plane.slot -= stage2[1][index];

			// 制空値の更新
			let prevAp = plane.airPower;
			plane.updateAirPower();

			fleet.airPower -= prevAp - plane.airPower;
			fleet.unionAirPower -= prevAp - plane.airPower;

			if (fleet.airPower < 0) fleet.airPower = 0;
			if (fleet.unionAirPower < 0) fleet.unionAirPower = 0;
		}
	}

	return steel;
}

/**
 * 自陣被撃墜
 * @param {number} asIndex 制空状態
 * @param {Fleet} fleet 味方艦隊
 * @param {Battle} battleInfo 戦闘情報(enemies: 敵id羅列 stage2: st2撃墜テーブル cellType: 戦闘タイプ)
 * @param {number} battle 戦闘番号
 * @param {boolean} [isFirst=true] 航空戦1回目かどうか 航空戦マス2回目ならfalse
 */
function shootDownFleet(asIndex, fleet, battleInfo, battle, isFirst = true) {
	const range = battleInfo.stage2[0][0].length;
	// 双方制空0(asIndex === 5)の場合、制空権確保となるので変更
	if (asIndex === 5) asIndex = 0;
	const needStage2 = battleInfo.enabledStage2;
	const len = fleet.ships.length;
	for (let i = 0; i < len; i++) {
		const ship = fleet.ships[i];
		// 制空に関係ない艦娘はスキップ
		if (ship.ignoreSlot) continue;
		let shipAp = 0;
		// 通常戦闘の場合、第2艦隊スキップ または夜戦　ただし搭載数の記録は必要なのでここでcontinueはしない
		const isSkip = (!battleInfo.isUnion && ship.isEscort) || battleInfo.cellType === 4;
		const planeLen = ship.items.length;
		for (let j = 0; j < planeLen; j++) {
			const plane = ship.items[j];
			// この戦闘開始時のスロット数を記録
			if (isFirst) plane.results[battle] += plane.slot;

			// 0機スロ 非制空争い機は搭載数を据え置いてスキップ
			if (isSkip || !plane.canBattle || plane.slot <= 0 || !range) {
				shipAp += plane.airPower;
				continue;
			}

			// st1撃墜 噴式の場合0.6掛け
			const downNumber = getShootDownSlotFF(asIndex, plane.slot);
			plane.slot -= Math.floor(plane.isJet ? 0.6 * downNumber : downNumber);

			// st2撃墜 (攻撃機のみ)
			if (plane.isAttacker && needStage2) {
				// 迎撃担当
				const index = Math.floor(Math.random() * range);
				const stage2Table = battleInfo.stage2[plane.avoid];
				// 割合撃墜 50% で失敗
				if (Math.random() >= 0.5) plane.slot -= Math.floor(stage2Table[0][index] * plane.slot);
				// 固定撃墜 50% で失敗
				if (Math.random() >= 0.5) plane.slot -= stage2Table[1][index];
			}

			// 制空値再計算 偵察機以外
			if (plane.canBattle && plane.slot > 0) {
				// 基本制空値 + ボーナス制空値
				plane.airPower = Math.floor(plane.antiAir * Math.sqrt(plane.slot) + plane.bonusAirPower);
			}
			else if (plane.slot <= 0) {
				plane.slot = 0;
				plane.airPower = 0;
			}
			else {
				plane.airPower = 0;
			}

			shipAp += plane.airPower;
		}
		// 制空値更新
		ship.airPower = shipAp;
	}
	// 制空値更新
	fleet.updateAirPower();
}

/**
 * 基地被撃墜
 * @param {number} asIndex 制空状態
 * @param {LandBase} landBase 味方艦隊
 * @param {Battle} battleInfo 戦闘情報
 */
function shootDownLandBase(asIndex, landBase, battleInfo) {
	const range = battleInfo.stage2[0][0].length;

	// 敵艦なしの場合スキップ
	if (!range) return;

	// 双方制空0(asIndex === 5)の場合、制空権確保となるので変更
	if (asIndex === 5) asIndex = 0;
	let sumAp = 0;
	const len = landBase.planes.length;
	for (let j = 0; j < len; j++) {
		const plane = landBase.planes[j];
		// 0機スキップ
		if (plane.slot <= 0) continue;

		// st1撃墜 噴式の場合0.6掛け
		const downNumber = getShootDownSlotFF(asIndex, plane.slot);
		plane.slot -= Math.floor(plane.isJet ? 0.6 * downNumber : downNumber);

		// st2撃墜
		if (plane.isAttacker) {
			// 迎撃担当
			const index = Math.floor(Math.random() * range);
			const stage2Table = battleInfo.stage2[plane.avoid];
			// 割合撃墜 50% で失敗
			if (Math.random() >= 0.5) plane.slot -= Math.floor(stage2Table[0][index] * plane.slot);
			// 固定撃墜 50% で失敗
			if (Math.random() >= 0.5) plane.slot -= stage2Table[1][index];
		}

		// この機体の制空値を再計算
		plane.updateAirPower();
		sumAp += plane.airPower;
	}

	// この航空隊の制空値を再計算
	landBase.airPower = Math.floor(sumAp * landBase.reconCorr);
}

/**
 * 各種制空状態確率計算
 */
function rateCalculate() {
	// 引数群
	const landBaseData = inputItems.landBase;
	const fleet = inputItems.fleet;
	const battleData = inputItems.battleInfo;
	let maxCount = castInt($('#calculate_count').val());
	maxCount = maxCount <= 0 ? 1 : maxCount;
	$('#calculate_count').val(maxCount);
	const fleetLen = fleet.ships.length;
	const battleInfo = battleData.battles;
	/** @type {number} 計算する戦闘 初戦0 */
	let mainBattle = isDefMode ? 0 : displayBattle;

	// 結果格納群
	// 各制空状態の分布
	const fleetASDist = [0, 0, 0, 0, 0, 0];

	// 緒戦の最終味方制空値
	const avgMainAps = [];
	// 緒戦の最終敵制空値
	const avgEnemyAps = [];

	// 出撃終了時点の結果格納用
	const slotResults = [];

	// 敵スロット明細 (各戦闘毎に以下データ [敵スロット番号, sum, max, min])
	const enemySlotResult = [];
	const enemyAps = [[], []];
	const maxBattle = isDefMode ? 1 : battleCount;
	let sumUsedSteels = 0;
	// 航空戦セルタイプ
	const cell_aerial = CELL_TYPE.aerialCombat;
	// 敵の棒立ち回数記録
	const enemySlotAllDead = [];

	// 搭載数のない敵艦を全て除外(stage2テーブルは生成済み)
	for (const info of battleInfo) {
		info.enemies = info.enemies.filter(v => v.id === -1 || v.slots.length > 0);
	}

	mainBattle = mainBattle < battleData.battles.length ? mainBattle : battleData.battles.length - 1;
	for (let i = 0; i < maxBattle; i++) {
		avgMainAps.push(0);
		avgEnemyAps.push(0);
	}

	// 機体の最終搭載数をシミュ1回毎に記録するための準備
	for (let i = 0; i < fleetLen; i++) {
		const ship = fleet.ships[i];
		if (ship.ignoreSlot) continue;
		for (let j = 0; j < ship.items.length; j++) {
			if (!ship.items[j].isPlane) continue;
			slotResults.push(new Array(maxCount));
		}
	}
	// 表示戦闘の敵スロット保持用テーブル準備
	for (let i = 0; i < battleInfo[mainBattle].enemies.length; i++) {
		const enemy = battleInfo[mainBattle].enemies[i];

		// 偵察機のみ搭載艦は飛ばす(いまは1機でも含まれてたらそうなるが...)
		if (enemy.onlyScout || enemy.id < 0) {
			continue;
		}
		// 敵インデックス
		const enemyNo = enemySlotResult.length === 0 ? 0 : enemySlotResult[enemySlotResult.length - 1][0] + 1;
		// 有効スロット数だけ作成
		for (let j = 0; j < enemy.slots.length; j++) {
			enemySlotResult.push([enemyNo, j, 0, 0, 999]);
		}
		enemySlotAllDead.push(0);
	}

	// 1戦目の戦闘形態で重爆かどうか判定 (1戦は絶対なんかデータあるのでnullがくるこたないはず)
	const defAp = battleInfo[0].cellType === CELL_TYPE.highAirRaid ? landBaseData.defense2AirPower : landBaseData.defenseAirPower;
	resultData.defenseAirPower = defAp;
	if (isDefMode) {
		// 本隊制空値を書き換えてしまう => ループ中に防空かどうかを判定しなくてよくなる
		fleet.fullAirPower = defAp;
		fleet.airPower = defAp;
		fleet.fullUnionAirPower = defAp;
		fleet.unionAirPower = defAp;
	}

	let defEnemyAp = 0;
	if (isDefMode || battleInfo[0]) {
		defEnemyAp = battleInfo[0].getAirPower();
	}

	// 対空砲火設定を適用する？
	const adaptStage2 = !isDefMode && document.getElementById('adapt_stage2')['checked'];
	// 味方stage2テーブルおきば
	let stage2Table = [];
	// 対空砲火設定を適用する場合
	if (adaptStage2) {
		// 陣形取得 => ここは計算結果欄で選択されている陣形
		const formationId = castInt($('#fleet_formation').val());
		if (fleet.isUnion && battleInfo[mainBattle].cellType === CELL_TYPE.airRaid) {
			// 連合艦隊かつ表示戦闘が空襲戦だった場合、艦隊の対空性能を再計算する(空襲補正がかかるため)
			fleet.updateStage2All(formationId, true);
		}
		else {
			// 陣形のみ設定して艦隊対空性能を再計算
			fleet.updateStage2All(formationId);
		}

		stage2Table = fleet.allStage2;
	}

	// メイン
	for (let count = 0; count < maxCount; count++) {
		// 道中含めてブン回し
		for (let battle = 0; battle < maxBattle; battle++) {
			const thisBattleInfo = battleInfo[battle];
			const enemies = thisBattleInfo.enemies;
			// 敵機の補給が必要かどうか
			let needSupply = false;

			// 基地戦闘 trueが帰ってきたら敵機が減っているので補給必要
			needSupply = calculateLandBase(landBaseData, thisBattleInfo, battle);

			// 本隊噴式強襲フェーズ 返り値として鋼材消費
			sumUsedSteels += doJetPhase(fleet, thisBattleInfo);

			const fap = thisBattleInfo.isUnion ? fleet.unionAirPower : fleet.airPower;
			const eap = thisBattleInfo.getAirPower();
			let airIndex = getAirStatusIndex(fap, eap);

			// 表示戦闘での制空状態を記録
			if (battle === mainBattle) fleetASDist[airIndex] += 1;

			// この戦闘での双方の開始時制空値を記録
			avgMainAps[battle] += fap;
			avgEnemyAps[battle] += eap;

			// 味方st1 & st2
			shootDownFleet(airIndex, fleet, thisBattleInfo, battle);

			// 航空戦マスならもう一回
			if (thisBattleInfo.cellType === cell_aerial) {
				// 敵機撃墜(1回目)
				shootDownEnemy(airIndex, enemies, adaptStage2, stage2Table);
				// 撃墜処理を行ったので補給を行う必要がある
				needSupply = true;

				// 減った制空値でもう一回st1 st2を起こす
				airIndex = getAirStatusIndex(fleet.airPower, thisBattleInfo.getAirPower());
				// 味方st1 & st2 2回目
				shootDownFleet(airIndex, fleet, thisBattleInfo, battle, false);
			}

			// 表示戦闘の敵機撃墜と搭載数記録　これ以外の戦闘は本隊による敵撃墜計算はしない
			if (battle === mainBattle) {
				// 敵st1 & st2
				shootDownEnemy(airIndex, enemies, adaptStage2, stage2Table);

				let index = 0;
				let index2 = 0;
				let downAp = 0;
				for (let i = 0; i < enemies.length; i++) {
					const enemy = enemies[i];
					if (!enemy.onlyScout && enemy.id) {
						const slots = enemy.slots;
						const attackers = enemy.attackers.concat();
						for (let j = 0; j < slots.length; j++) {
							const slotValue = slots[j];
							const slotResult = enemySlotResult[index];
							index += 1;
							// 合計値
							slotResult[2] += slotValue;
							// 最大値更新
							if (slotResult[3] < slotValue) slotResult[3] = slotValue;
							// 最小値更新
							if (slotResult[4] > slotValue) slotResult[4] = slotValue;
							// 全滅判定
							if (slotValue === 0) attackers[j] = false;
						}

						// 棒立ち判定 => 全ての攻撃機フラグが落ちているかどうか
						if (attackers.indexOf(true) < 0) enemySlotAllDead[index2] += 1;
						index2 += 1;

						downAp += enemy.airPower;
					}

					// 補給
					enemy.slots = enemy.fullSlots.concat();
					enemy.airPower = enemy.fullAirPower;
					enemy.landBaseAirPower = enemy.fullLandBaseAirPower;
				}

				enemyAps[0].push(eap);
				enemyAps[1].push(downAp);

				// 搭載数記録ついでに補給も行ったので不要
				needSupply = false;
			}

			if (needSupply) {
				// 敵機補給
				for (const enemy of enemies) {
					enemy.slots = enemy.fullSlots.concat();
					enemy.airPower = enemy.fullAirPower;
					enemy.landBaseAirPower = enemy.fullLandBaseAirPower;
				}
			}
		}

		// 基地の補給
		for (let i = 0; i < 3; i++) {
			const landBase = landBaseData.landBases[i];
			if (landBase.mode === 0) {
				continue;
			}

			for (let j = 0; j < landBase.planes.length; j++) {
				const plane = landBase.planes[j];
				plane.slot = plane.fullSlot;
				plane.airPower = plane.fullAirPower
			}
			landBase.airPower = landBase.fullAirPower;
		}

		// カーソル
		let resultIndex = 0;
		// 自艦隊各スロット清算、補給
		for (let i = 0; i < fleetLen; i++) {
			const ship = fleet.ships[i];
			if (ship.ignoreSlot) continue;

			const planesLen = ship.items.length;
			for (let j = 0; j < planesLen; j++) {
				const plane = ship.items[j];
				if (plane.isPlane) {
					slotResults[resultIndex++][count] = plane.slot;
					plane.slot = plane.fullSlot;
					plane.airPower = plane.fullAirPower;
				}
			}
			ship.airPower = ship.fullAirPower;
		}
		fleet.airPower = fleet.fullAirPower;
		fleet.escortAirPower = fleet.fullEscortAirPower;
		fleet.unionAirPower = fleet.fullUnionAirPower;
	}

	// 出撃後スロット数の統計
	let n = 0;
	for (let i = 0; i < fleetLen; i++) {
		const ship = fleet.ships[i];
		// 関係ないので結果無視
		if (ship.ignoreSlot) continue;

		for (let j = 0; j < ship.items.length; j++) {
			if (ship.items[j].isPlane) {
				const s = slotResults[n];
				const tmp = {
					shipNo: ship.shipNo,
					slot: ship.items[j].slotNo,
					max: getArrayMax(s),
					min: getArrayMin(s),
					avg: s.reduce((t, v) => t + v) / maxCount,
					death: s.filter(v => v === 0).length,
					deathRate: 0,
				};
				tmp.deathRate = tmp.death / s.length;
				resultData.fleetSlots.push(tmp);

				n += 1;
			}
		}
	}

	// 各戦闘搭載、制空値などの平均値の表示
	const $table = $('#shoot_down_table');
	for (let i = 0; i < maxBattle; i++) {
		const avgAP = Math.round(avgMainAps[i] / maxCount);
		const avgEAP = Math.round(avgEnemyAps[i] / maxCount);
		const airIndex = getAirStatusIndex(avgAP, avgEAP);
		$table.find(`.fap.battle${i + 1}`).text(avgAP);
		$table.find(`.eap.battle${i + 1}`).text(avgEAP);
		$table.find(`.cond.battle${i + 1}`)
			.html(`<span>${AIR_STATUS[airIndex].abbr}</span>`)
			.removeClass(`airStatus0 airStatus1 airStatus2 airStatus3 airStatus4`)
			.addClass(`airStatus${airIndex}`);

		for (const ship of fleet.ships) {
			if (ship.ignoreSlot) continue;
			for (const plane of ship.items) {
				if (plane.isPlane) {
					const result = plane.results[i];
					$(`#s${ship.shipNo}sl${plane.slotNo}`).find(`.battle${i + 1}`).text(Math.round(result / maxCount));
				}
			}
		}
	}

	// 関係ない戦闘は省く
	$table.find('td').removeClass('d-none');
	for (let i = battleCount + 1; i <= 10; i++) {
		$table.find(`.battle${i}`).addClass('d-none');
	}

	if (!isDefMode) {
		resultData.fleetAirPower = Math.round(avgMainAps[mainBattle] / maxCount)
	}

	// 表示戦闘における各航空隊の状態を取得
	const airStatusDist = [];
	for (const landBase of landBaseData.landBases) {
		for (let i = 0; i < 2; i++) {
			airStatusDist.push(landBase.results[displayBattle].airStatusIndex[i].map(v => v / maxCount));
		}
	}

	// それぞれの制空状態の総数を確率化して格納 基地は表示戦闘の各フェーズあり
	// 表示戦闘の基地開始制空値を格納
	for (const landBase of landBaseData.landBases) {
		resultData.landBaseAirPowers.push(Math.round(landBase.results[mainBattle].mainAirPower[0] / maxCount));
		resultData.landBaseAirPowers.push(Math.round(landBase.results[mainBattle].mainAirPower[1] / maxCount));
		resultData.enemyAirPowers.push(Math.round(landBase.results[mainBattle].enemyAirPower[0] / maxCount));
		resultData.enemyAirPowers.push(Math.round(landBase.results[mainBattle].enemyAirPower[1] / maxCount));
	}

	if (isDefMode) {
		resultData.enemyAirPowers.push(defEnemyAp);
	}
	else {
		resultData.enemyAirPowers.push(Math.round(avgEnemyAps[mainBattle] / maxCount));
	}

	resultData.landBaseAirStatus = airStatusDist;
	resultData.fleetAirStatus = fleetASDist.map(v => v / maxCount);
	resultData.enemySlots = enemySlotResult;
	resultData.enemyAirPowerResults = enemyAps;
	resultData.enemySlotAllDead = enemySlotAllDead;
	resultData.usedSteels = sumUsedSteels;
}

/**
 * 指定された敵艦隊に対して基地攻撃を行う。
 * @param {LandBaseAll} landBaseData 基地航空隊オブジェクト
 * @param {Battle} battleInfo 被害者の会
 * @param {number} battleIndex 戦闘番号
 * @returns {boolean} 敵機撃墜処理が発生した場合 true
 */
function calculateLandBase(landBaseData, battleInfo, battleIndex) {
	const enemyFleet = battleInfo.enemies;

	// 敵機撃墜が発生したかどうか
	let enemyShootDown = false;

	for (let j = 0; j < 3; j++) {
		const landBase = landBaseData.landBases[j];
		const wave1 = landBase.target[0];
		const wave2 = landBase.target[1];

		if (wave1 !== battleIndex && wave2 !== battleIndex) {
			// 1派目 2派目ともに対象でないなら飛ばす
			continue;
		}
		const result = landBase.results[battleIndex];

		// 出撃第一波
		if (wave1 === battleIndex) {
			// 噴式強襲フェーズ
			doLandBaseJetPhase(landBase, battleInfo);

			const lbAp = landBase.airPower;
			const eap = battleInfo.getLandBaseAirPower();
			// 敵制空値0の場合は確保扱い
			const airStatusIndex = eap === 0 ? 0 : getAirStatusIndex(lbAp, eap);

			// 結果の格納
			result.airStatusIndex[0][airStatusIndex] += 1;
			result.mainAirPower[0] += lbAp;
			result.enemyAirPower[0] += eap;

			// 敵機削り
			shootDownEnemy(airStatusIndex, enemyFleet);
			enemyShootDown = true;

			// 派遣先が違う場合は被害を起こす
			if (landBase.isSeparate) {
				shootDownLandBase(airStatusIndex, landBase, battleInfo);
			}
		}

		// 出撃第二波
		if (wave2 === battleIndex) {

			// 派遣先が違う場合は噴式強襲フェーズ起こす
			if (landBase.isSeparate) {
				doLandBaseJetPhase(landBase, battleInfo);
			}

			const lbAp = landBase.airPower;
			const eap = battleInfo.getLandBaseAirPower();
			// 敵制空値0の場合は確保扱い
			const airStatusIndex = eap === 0 ? 0 : getAirStatusIndex(lbAp, eap);

			// 結果の格納
			result.airStatusIndex[1][airStatusIndex] += 1;
			result.mainAirPower[1] += lbAp;
			result.enemyAirPower[1] += eap;

			// 敵機削り
			shootDownEnemy(airStatusIndex, enemyFleet);
			enemyShootDown = true;

			// 派遣先が違う場合は被害を起こす
			if (landBase.isSeparate) {
				shootDownLandBase(airStatusIndex, landBase, battleInfo);
			}
		}
	}

	return enemyShootDown;
}

/**
 * 詳細結果表示
 */
function detailCalculate() {
	const baseNo = castInt($('#detail_info').data('base_no'));
	const slot = castInt($('#detail_info').data('slot_no'));
	// 計算する対象の取得
	switch ($('#detail_info').data('mode')) {
		case "enemy_slot_detail":
			enemySlotDetailCalculate(baseNo, slot);
			break;
		case "fleet_slot_detail":
			fleetSlotDetailCalculate(baseNo, slot, castInt($('#detail_info').data('ship_id')));
			break;
		case "land_base_detail":
			landBaseDetailCalculate(baseNo, slot);
			break;
		default:
			break;
	}
}

/**
 * 味方スロット撃墜数詳細計算
 * @param {number} shipNo
 * @param {number} slotNo
 * @param {number} shipId
 * @returns {boolean} 中止された場合false
 */
function fleetSlotDetailCalculate(shipNo, slotNo, shipId = 0) {
	// 事前計算テーブルチェック
	setPreCalculateTable();

	// 基地オブジェクト取得
	const landBaseData = createLandBaseInstance();
	// 味方艦隊オブジェクト取得
	const fleet = createFleetInstance();
	// 戦闘情報オブジェクト取得
	const battleInfo = updateEnemyFleetInfo(false);
	// 計算回数
	const maxCount = castInt($('#detail_calculate_count').val());
	// チャート用散布
	const data = [];
	// 今回の記録用の味方データ
	const shipInstance = fleet.ships[shipNo];
	const plane = ITEM_DATA.find(v => v.id === shipInstance.items[slotNo].id && PLANE_TYPE.includes(v.type));
	if (!plane) {
		return false;
	}

	// 表示戦闘 通常はdisplayBattleとせず、最終戦闘とする
	let mainBattle = isDefMode ? 0 : battleInfo.battles.length - 1;
	// 計算機側で指定の戦闘が設定されていたらそっちを使いたい
	const targetBattle = castInt(document.getElementById('target_enemy').value, -1);
	if (targetBattle >= 0 && targetBattle < battleInfo.battles.length) {
		mainBattle = targetBattle;
	}

	// 対空砲火設定を適用する？
	const adaptStage2 = document.getElementById('adapt_stage2')['checked'];
	// 味方stage2テーブルおきば
	let stage2Table = [];
	// 対空砲火設定を適用する場合
	if (adaptStage2) {
		// 陣形取得 => ここは計算結果欄で選択されている陣形
		const formationId = castInt($('#fleet_formation').val());
		if (fleet.isUnion && battleInfo.battles[mainBattle].cellType === CELL_TYPE.airRaid) {
			// 連合艦隊かつ表示戦闘が空襲戦だった場合、艦隊の対空性能を再計算する(空襲補正がかかるため)
			fleet.updateStage2All(formationId, true);
		}
		else {
			// 陣形のみ設定して艦隊対空性能を再計算
			fleet.updateStage2All(formationId);
		}

		stage2Table = fleet.allStage2;
	}

	// 今回調査する主役
	const targetItem = shipInstance.items[slotNo];

	// 搭載数のない敵艦を全て除外(stage2テーブルは生成済み)
	for (const info of battleInfo.battles) {
		info.enemies = info.enemies.filter(v => v.slots.length > 0);
	}

	for (let count = 0; count < maxCount; count++) {

		// 道中含めてブン回し
		for (let battle = 0; battle <= mainBattle; battle++) {
			const thisBattleInfo = battleInfo.battles[battle];
			const enemies = thisBattleInfo.enemies;

			// 基地戦闘
			calculateLandBase(landBaseData, thisBattleInfo, battle);

			// 噴式強襲フェーズ
			doJetPhase(fleet, thisBattleInfo);

			const cellType = thisBattleInfo.cellType;
			const fap = thisBattleInfo.isUnion ? fleet.unionAirPower : fleet.airPower;
			const eap = thisBattleInfo.getAirPower();
			let airIndex = getAirStatusIndex(fap, eap);

			// 味方st1 & st2
			shootDownFleet(airIndex, fleet, thisBattleInfo, battle);

			// 航空戦マスならもう一回
			if (cellType === CELL_TYPE.aerialCombat) {
				// 敵機撃墜(1回目)
				shootDownEnemy(airIndex, enemies, adaptStage2, stage2Table);
				// 減った制空値でもう一回st1 st2を起こす
				airIndex = getAirStatusIndex(fleet.airPower, thisBattleInfo.getAirPower());
				// 味方st1 & st2
				shootDownFleet(airIndex, fleet, thisBattleInfo, battle, false);
			}
			// 敵機補給
			for (const enemy of enemies) {
				enemy.slots = enemy.fullSlots.concat();
				enemy.airPower = enemy.fullAirPower;
				enemy.landBaseAirPower = enemy.fullLandBaseAirPower;
			}
		}

		// 基地の補給
		for (let i = 0; i < 3; i++) {
			const landBase = landBaseData.landBases[i];
			for (let j = 0; j < landBase.planes.length; j++) {
				const plane = landBase.planes[j];
				plane.slot = plane.fullSlot;
				plane.updateAirPower();
			}
			landBase.updateAirPower();
		}

		// カーソル
		// 自艦隊各種スロット清算、補給
		for (let i = 0; i < fleet.ships.length; i++) {
			const ship = fleet.ships[i];
			const planesLen = ship.items.length;
			ship.airPower = 0;
			for (let j = 0; j < planesLen; j++) {
				const plane = ship.items[j];
				if (i === shipNo && plane.slotNo === slotNo) {
					data.push(plane.slot);
				}
				plane.slot = plane.fullSlot;
				plane.updateAirPower();

				ship.airPower += plane.airPower;
			}
		}
		fleet.updateAirPower();
	}

	const tooltips = {
		mode: 'index',
		callbacks: {
			title: (tooltipItem, data) => {
				const slot = castInt(tooltipItem[0].xLabel);
				return `残機数：${slot} 機${'\n'}航空戦火力：${ShipItem.getFirePower(targetItem, slot).join(' or ')}`;
			},
			label: (tooltipItem, data) => [`${tooltipItem.yLabel} %`],
		}
	}
	// グラフ描画、各搭載数の確率分布を取得
	chartSlotDistribution = updateDetailChart(data, '残機数 [機]', tooltips);

	// 説明表示
	const ship = SHIP_DATA.find(v => v.id === shipId);
	let planeText = '';
	let index = 0;

	document.getElementById('graph_title').textContent = `${mainBattle + 1}戦目終了時点での残機数分布`;

	$('#land_base_detail_table').addClass('d-none');
	$('.detail_fire').addClass('d-none').removeClass('d-flex');
	$('.detail_wave').removeClass('d-none').addClass('d-flex');
	$('#detail_info').data('mode', 'fleet_slot_detail');
	$('#detail_info').data('ship_id', shipId);
	$('#detail_info').data('base_no', shipNo);
	$('#detail_info').data('slot_no', slotNo);

	const warningText = `
		<div>※ グラフ内の航空戦火力はキャップ前でクリティカル、触接補正なし。小数切捨て</div>
		<div>※ 最終戦闘の航空戦終了時点での残数の分布を表示しています。</div>`;
	$('#detail_warning').html(warningText);

	for (const pl of shipInstance.items) {
		const p = ITEM_DATA.find(v => v.id === pl.id);
		if (index === (ship ? ship.slot.length : 4)) break;
		const name = p ? p.name : '-';
		const isPlane = PLANE_TYPE.includes(p ? p.type : 0);

		let statusText = '';
		if (isPlane && FIGHTERS.includes(p.type)) {
			statusText = p.antiAir ? `<span class="mx-1">対空: ${p.antiAir}</span>` : '';
		}
		else if (isPlane && RECONNAISSANCES.includes(p.type)) {
			statusText = p.antiAir ? `<span class="mx-1">対空: ${p.antiAir}</span>` : '';
			statusText += `<span class="mx-1">索敵: ${p.scout}</span>`;
		}
		else if (isPlane) {
			statusText = p.torpedo ? `<span class="mx-1">雷装: ${p.torpedo}</span>` : '';
			statusText += p.bomber ? `<span class="mx-1">爆装: ${p.bomber}</span>` : '';
		}

		planeText += `
		<div class="d-flex px-2 py-1 ${slotNo === index ? 'selected' : ''} ${isPlane ? `general_tr btn_show_detail` : 'disabled_detail_slot'}" data-slot_no="${index}">
			<div class="w_5 align-self-center font_size_11 text-right pr-1">${isPlane ? pl.slot : '-'}</div>
			<div class="${isPlane ? 'w_55' : 'w_90'} d-flex align-self-center font_size_12 pl-0">
				<img src="../img/type/${p ? `icon${p.itype}` : 'undefined'}.png" class="plane_img_sm align-self-center">
				<div class="align-self-center detail_item_name"><span>${name}</span></div>
				<div class="align-self-center ml-auto d-flex">
					${p && pl.remodel ? `<div class="align-self-center text_remodel mr-1">★${pl.remodel}</div>` : ''}
					${p && pl.level ? `<img class="ml-auto mr-1 h_20" alt="${getProfString(pl.level)}" data-prof="${pl.level}" src="../img/util/prof${pl.level}.png">` : ''}
				</div>
			</div>
			${isPlane ? `<div class="w_40 font_size_11 align-self-center">(${statusText})</div>` : ''}
		</div>`;
		index += 1;
	}

	const detailLegend = `
		<img src="../img/ship/${shipId}.png" class="ship_img align-self-center ${shipId ? '' : 'd-none'}">
		<span class="ml-1 align-self-center legend_name" data-shipid="${shipId}">${ship ? ship.name : '未指定'}</span>
	`;

	$('#detail_legend').html(detailLegend);
	$('#detail_info').html(planeText);

	// スロット選択欄の初期化
	const slots = chartSlotDistribution.map(v => v.slot);
	const maxSlot = getArrayMax(slots);
	if (document.getElementById('stage3_all_slot')['checked']) {
		document.getElementById('stage3_slot').value = maxSlot;
	}
	document.getElementById('stage3_all_slot_label').textContent =
		`残機数分布の結果を利用（${getArrayMin(slots)}機 ~ ${maxSlot}機）`;

	// 改修値の初期値
	document.getElementById('stage3_remodel').value = targetItem.remodel ? targetItem.remodel : 0;

	// 敵艦隊選択欄
	let enemiesText = '<option value="99">任意</option>';
	const maxBattle = battleInfo.battles.length - 1;
	const prevSelectedBattle = castInt(document.getElementById('target_enemy').value, -1);
	for (let i = 0; i <= maxBattle; i++) {
		if (prevSelectedBattle === i) {
			enemiesText += `<option value="${i}" selected>${i + 1}戦目</option>`;
		}
		else {
			enemiesText += `<option value="${i}">${i + 1}戦目</option>`;
		}
	}
	document.getElementById('target_enemy').innerHTML = enemiesText;
	// 特に初期値がなかったら最終戦闘
	if (prevSelectedBattle < 0 || prevSelectedBattle > maxBattle) {
		document.getElementById('target_enemy').value = 99;
	}

	stage3PowerCalculate();
	return true;
}

/**
 * 基地航空隊詳細計算
 * @param {number} landBaseNo 基地航空隊番号
 * @param {number} slotNo スロット番号
 * @param {boolean} autoForcus スロット自動選択
 */
function landBaseDetailCalculate(landBaseNo, slotNo, autoForcus = false) {
	// 事前計算テーブルチェック
	setPreCalculateTable();
	// 基地オブジェクト取得
	const landBaseData = createLandBaseInstance();
	// 戦闘情報オブジェクト取得
	const battleInfo = updateEnemyFleetInfo(false);
	// 計算回数
	const maxCount = castInt($('#detail_calculate_count').val());
	// チャート用散布
	const data = [];
	// 表示戦闘
	let mainBattle = isDefMode ? 0 : displayBattle;

	// 各隊の機体
	const planes = landBaseData.landBases[landBaseNo].planes;
	// 元の全機数
	let suppliedSlot = 0;

	// 攻撃機を探索 なければ第1スロット
	if (autoForcus && slotNo === 0 && !ATTACKERS.includes(planes[slotNo].type) && planes.some(v => ATTACKERS.includes(v.type))) {
		slotNo = planes.findIndex(v => ATTACKERS.includes(v.type));
	}

	// 有効なスロットかチェック & 元の全機数チェック
	for (let index = 0; index < planes.length; index++) {
		const plane = planes[index];
		if (planes[slotNo].id === 0 && plane.id !== 0) slotNo = index;
		suppliedSlot += plane.fullSlot;
	}

	// 撃墜された数を記録
	const aliveCount = [];

	for (let count = 0; count < maxCount; count++) {

		// 道中含めて表示戦闘までブン回し
		for (let battle = 0; battle <= mainBattle; battle++) {
			const thisBattleInfo = battleInfo.battles[battle];
			const enemies = thisBattleInfo.enemies;

			for (let j = 0; j < 3; j++) {
				const landBase = landBaseData.landBases[j];
				const wave1 = landBase.target[0];
				const wave2 = landBase.target[1];

				if (wave1 !== battle && wave2 !== battle) {
					// 1派目 2派目ともに対象でないなら飛ばす
					continue;
				}

				// 出撃第一波
				if (wave1 === battle) {
					// 噴式強襲フェーズ
					doLandBaseJetPhase(landBase, thisBattleInfo);

					const lbAp = landBase.airPower;
					const eap = thisBattleInfo.getLandBaseAirPower();
					// 双方制空値0の場合は確保扱い
					const airStatusIndex = (lbAp === 0 && eap === 0) ? 0 : getAirStatusIndex(lbAp, eap);

					// 敵機削り
					shootDownEnemy(airStatusIndex, enemies);

					if (wave1 !== wave2) {
						// 基地削られ
						shootDownLandBase(airStatusIndex, landBase, thisBattleInfo);
					}
				}

				// 出撃第二波
				if (wave2 === battle) {
					if (wave1 !== wave2) {
						// 噴式強襲フェーズ
						doLandBaseJetPhase(landBase, thisBattleInfo);
					}

					const lbAp = landBase.airPower;
					const eap = thisBattleInfo.getLandBaseAirPower();
					const airStatusIndex = (lbAp === 0 && eap === 0) ? 0 : getAirStatusIndex(lbAp, eap);

					// 敵機削り
					shootDownEnemy(airStatusIndex, enemies);

					// 基地削られ
					shootDownLandBase(airStatusIndex, landBase, thisBattleInfo);
				}
			}

			// 敵機補給
			for (const enemy of enemies) {
				enemy.slots = enemy.fullSlots.concat();
				enemy.airPower = enemy.fullAirPower;
				enemy.landBaseAirPower = enemy.fullLandBaseAirPower;
			}
		}

		// 基地の補給
		for (let i = 0; i < 3; i++) {
			const landBase = landBaseData.landBases[i];
			let sumAlive = 0;
			for (let j = 0; j < landBase.planes.length; j++) {
				const plane = landBase.planes[j];
				if (landBaseNo + 1 === landBase.baseNo && slotNo === j) {
					data.push(plane.slot);
				}
				sumAlive += plane.slot;
				plane.slot = plane.fullSlot;
				plane.updateAirPower();
			}

			if (landBaseNo + 1 === landBase.baseNo) {
				aliveCount.push(sumAlive);
			}
			landBase.updateAirPower();
		}
	}

	// 機体id
	const planeId = planes[slotNo].id;
	// 改修値
	const remodel = planes[slotNo].remodel;
	// 陸偵補正：二式陸偵 = 1.125、二式陸偵(熟練) = 1.15
	const adj2 = planes.find(v => v.id === 312) ? 1.15 : planes.find(v => v.id === 311) ? 1.125 : 1.0;
	// 敵連合特効：対敵通常艦隊 = 1.0、対敵連合艦隊 = 1.1
	const adj3 = battleInfo.battles[mainBattle].isUnion ? 1.1 : 1.0;
	const tooltips = {
		mode: 'index',
		callbacks: {
			title: (tooltipItem, data) => {
				const value = tooltipItem[0].xLabel;
				const last = LandBaseItem.getFirePower(planeId, value, remodel) * adj2 * adj3;
				const ap = `航空戦火力：${last.toFixed(1)}`
				if (!value) return `残機数：0 機${'\n'}航空戦火力：0`;
				else return `残機数：${value} 機${'\n' + ap}`;
			},
			label: (tooltipItem, data) => [`${tooltipItem.yLabel} %`],
		}
	}
	// グラフ描画
	chartSlotDistribution = updateDetailChart(data, '残機数 [機]', tooltips);

	// 未帰還機多数とかのアレ
	let count1 = 0;
	let count2 = 0;
	let count3 = 0;

	for (const v of aliveCount) {
		// 生存率
		const aliveRate = v / suppliedSlot;
		if (v === 0) count3 += 1;
		else if (aliveRate < 0.25) count2 += 1;
		else if (aliveRate < 0.4) count1 += 1;
	}
	$('#status_s').text((100 * count1 / maxCount) + ' %');
	$('#status_m').text((100 * count2 / maxCount) + ' %');
	$('#status_l').text((100 * count3 / maxCount) + ' %');

	// 説明表示
	let planeText = '';
	let index = 0;
	document.getElementById('graph_title').textContent = '出撃終了時点での残機数分布';

	$('#land_base_detail_table').removeClass('d-none');
	$('.detail_fire').addClass('d-none').removeClass('d-flex');
	$('.detail_wave').removeClass('d-none').addClass('d-flex');
	$('#detail_info').data('mode', 'land_base_detail');
	$('#detail_info').data('base_no', landBaseNo);
	$('#detail_info').data('slot_no', slotNo);
	const warningText = `
		<div>※ グラフ内の航空戦火力はクリティカル補正、触接補正なしで対水上艦の場合</div>
		<div>※ 対敵連合補正、陸偵補正については、該当する戦闘、装備であれば有効</div>`;
	$('#detail_warning').html(warningText);

	for (const pl of landBaseData.landBases[landBaseNo].planes) {
		const p = ITEM_DATA.find(v => v.id === pl.id);
		const name = p ? p.name : '-';

		let statusText = '';
		if (FIGHTERS.includes(p.type)) {
			statusText = p.antiAir ? `<span class="mx-1">対空: ${p.antiAir}</span>` : '';
			statusText += `<span class="mx-1">半径: ${p.radius}</span>`;
		}
		else if (RECONNAISSANCES.includes(p.type)) {
			statusText = p.antiAir ? `<span class="mx-1">対空: ${p.antiAir}</span>` : '';
			statusText += `<span class="mx-1">索敵: ${p.scout}</span>`;
			statusText += `<span class="mx-1">半径: ${p.radius}</span>`;
		}
		else {
			statusText = p.torpedo ? `<span class="mx-1">雷装: ${p.torpedo}</span>` : '';
			statusText += p.bomber ? `<span class="mx-1">爆装: ${p.bomber}</span>` : '';
			statusText += `<span class="mx-1">半径: ${p.radius}</span>`;
		}

		planeText += `
		<div class="d-flex px-2 py-1 ${slotNo === index ? 'selected' : ''} ${p ? `general_tr btn_show_detail` : ''}" data-slot_no="${index}">
			<div class="w_5 align-self-center font_size_11 text-right pr-1">${pl.slot}</div>
			<div class="w_55 d-flex align-self-center font_size_12 pl-0">
				<img src="../img/type/${p ? `icon${p.itype}` : 'undefined'}.png" class="plane_img_sm align-self-center">
				<div class="align-self-center detail_item_name"><span>${name}</span></div>
				<div class="align-self-center ml-auto d-flex">
					${p && pl.remodel ? `<div class="align-self-center text_remodel mr-1">★${pl.remodel}</div>` : ''}
					${p && pl.level ? `<img class="ml-auto mr-1 h_20" alt="${getProfString(pl.level)}" data-prof="${pl.level}" src="../img/util/prof${pl.level}.png">` : ''}
				</div>
			</div>
			<div class="w_40 font_size_11 align-self-center">(${statusText})</div>
		</div>`;
		index += 1;
	}

	$('#detail_legend').html(`<span>第${landBaseNo + 1}基地航空隊</span>`);
	$('#detail_info').html(planeText);

	// スロット選択欄の初期化
	const slots = chartSlotDistribution.map(v => v.slot);
	const maxSlot = getArrayMax(slots);
	if (document.getElementById('stage3_all_slot')['checked']) {
		document.getElementById('stage3_slot').value = maxSlot;
	}
	document.getElementById('stage3_all_slot_label').textContent =
		`残機数分布の結果を利用（${getArrayMin(slots)}機 ~ ${maxSlot}機）`;

	// 改修値の初期値
	document.getElementById('stage3_remodel').value = remodel ? remodel : 0;

	// 二式陸上偵察機が含まれているならON
	if (planes.some(v => v.id === 311)) {
		document.getElementById('enabled_rikutei')['checked'] = true;
	}
	// 二式陸上偵察機(熟練)が含まれているならON
	if (planes.some(v => v.id === 312)) {
		document.getElementById('enabled_rikutei_z')['checked'] = true;
	}

	// 敵艦隊選択欄
	let enemiesText = '<option value="99">任意</option>';
	const maxBattle = battleInfo.battles.length - 1;
	const prevSelectedBattle = castInt(document.getElementById('target_enemy').value, -1);
	for (let i = 0; i <= maxBattle; i++) {
		if (prevSelectedBattle === i) {
			enemiesText += `<option value="${i}" selected>${i + 1}戦目</option>`;
		}
		else {
			enemiesText += `<option value="${i}">${i + 1}戦目</option>`;
		}
	}
	document.getElementById('target_enemy').innerHTML = enemiesText;

	// 特に初期値がなかったら任意
	if (prevSelectedBattle < 0 || prevSelectedBattle > maxBattle) {
		document.getElementById('target_enemy').value = 99;
	}

	// 初回起動
	if (autoForcus && (prevSelectedBattle < 0 || prevSelectedBattle > maxBattle)) {
		document.getElementById('target_enemy').value = landBaseData.landBases[landBaseNo].target[0];
	}

	stage3PowerCalculate();
}

/**
 * 敵スロット撃墜数詳細計算
 * @param {number} enemyNo
 * @param {number} slotNo
 * @param {boolean} autoForcus スロット自動選択
 */
function enemySlotDetailCalculate(enemyNo, slotNo, autoForcus = false) {
	// 事前計算テーブルチェック
	setPreCalculateTable();
	// 基地オブジェクト取得
	const landBaseData = createLandBaseInstance();
	// 味方艦隊オブジェクト取得
	const fleet = createFleetInstance();
	// 戦闘情報オブジェクト取得
	const battleInfo = updateEnemyFleetInfo(false);
	// 計算回数
	const maxCount = castInt($('#detail_calculate_count').val());
	// 表示戦闘
	let mainBattle = isDefMode ? 0 : displayBattle;
	// 例外排除
	mainBattle = mainBattle < battleInfo.battles.length ? mainBattle : battleInfo.battles.length - 1;
	// チャート用散布
	const fireData = [];
	// スロットのデータは絶対とることに
	const slotData = [];
	// 今回の記録用の敵データ
	const targetEnemy = battleInfo.battles[mainBattle].enemies.filter(v => v.slots.length > 0 && !v.onlyScout)[enemyNo];
	const enemy = ENEMY_DATA.find(v => v.id === targetEnemy.id);
	// slotNo は艦載機だけの配列で見ている => 艦載機のみ配列を作る enemy.eqp.filter()
	let planes = enemy.eqp.map(v => ENEMY_ITEM.find(x => x.id === v));
	planes = planes.filter(v => FIGHTERS.includes(v.type) || ATTACKERS.includes(v.type));

	// 攻撃機があるなら自動補正
	if (autoForcus && !ATTACKERS.includes(planes[slotNo].type) && planes.some(v => ATTACKERS.includes(v.type))) {
		slotNo = planes.findIndex(v => ATTACKERS.includes(v.type));
	}
	const plane = planes[slotNo];

	// 今回調査する機体データ
	const targetItem = new EnemyItem(plane.id);
	// 搭載表示 or 航空戦火力表示
	const isSlotDetail = $('#slot_detail').prop('checked');

	// 味方stage2テーブルおきば
	let stage2Table = [];
	// 対空砲火設定を適用する？ ここは計算画面内のチェックボックス欄で制御させる
	const adaptStage2 = document.getElementById('enabled_manual_stage2')['checked'];
	// 対空砲火設定を適用する場合
	if (adaptStage2) {
		// 陣形取得 => ここは計算結果欄で選択されている陣形
		const formationId = castInt($('#fleet_formation').val());
		if (fleet.isUnion && battleInfo.battles[mainBattle].cellType === CELL_TYPE.airRaid) {
			// 連合艦隊かつ表示戦闘が空襲戦だった場合、艦隊の対空性能を再計算する(空襲補正がかかるため)
			fleet.updateStage2All(formationId, true);
		}
		else {
			// 陣形のみ設定して艦隊対空性能を再計算
			fleet.updateStage2All(formationId);
		}

		// 対空CI不発チェック
		const aaCutInMiss = document.getElementById('aa_cutin_miss')['checked'];
		document.getElementById('aa_cutin_miss').parentElement.classList.remove('d-none');

		stage2Table = fleet.allStage2;
		// 対空CI不発にチェックが入っている場合 不発データ(テーブルの最後尾がソレだけにする)
		if (aaCutInMiss) stage2Table = [stage2Table[stage2Table.length - 1]];
	}
	else {
		document.getElementById('aa_cutin_miss').parentElement.classList.add('d-none');
	}

	// 搭載数のない敵艦を全て除外(stage2テーブルは生成済み)
	for (const info of battleInfo.battles) {
		info.enemies = info.enemies.filter(v => v.slots.length > 0);
	}

	for (let count = 0; count < maxCount; count++) {

		// 表示戦闘まで道中含めてブン回し
		for (let battle = 0; battle <= mainBattle; battle++) {
			const thisBattleInfo = battleInfo.battles[battle];
			const enemies = thisBattleInfo.enemies;

			// 基地戦闘
			calculateLandBase(landBaseData, thisBattleInfo, battle);

			// 噴式強襲フェーズ
			doJetPhase(fleet, thisBattleInfo);

			const cellType = thisBattleInfo.cellType;
			const fap = thisBattleInfo.isUnion ? fleet.unionAirPower : fleet.airPower;
			const eap = thisBattleInfo.getAirPower();
			let airIndex = getAirStatusIndex(fap, eap);

			// 味方st1 & st2
			shootDownFleet(airIndex, fleet, thisBattleInfo, battle);

			// 航空戦マスならもう一回
			if (cellType === CELL_TYPE.aerialCombat) {
				// 敵機撃墜(1回目)
				shootDownEnemy(airIndex, enemies, adaptStage2, stage2Table);
				// 減った制空値でもう一回st1 st2を起こす
				airIndex = getAirStatusIndex(fleet.airPower, thisBattleInfo.getAirPower());
				// 味方st1 & st2
				shootDownFleet(airIndex, fleet, thisBattleInfo, battle, false);
			}
			// 表示戦闘の敵搭載数記録
			if (battle === mainBattle) {
				// 敵st1 & st2
				shootDownEnemy(airIndex, enemies, adaptStage2, stage2Table);

				const slot = targetEnemy.slots[slotNo];
				// 指定した敵とスロットの数を格納 スロットは絶対とることになった
				slotData.push(slot);

				if (!isSlotDetail) {
					// 航空戦火力
					const powers = targetItem.getFirePower(slot);
					if (powers.length === 2) {
						fireData.push(powers[0]);
						fireData.push(powers[1]);
					}
					else fireData.push(powers[0]);
				}
			}

			// 補給
			for (let i = 0; i < enemies.length; i++) {
				const enemy = enemies[i];
				if (enemy.onlyScout) continue;
				enemy.slots = enemy.fullSlots.concat();
				enemy.airPower = enemy.fullAirPower;
				enemy.landBaseAirPower = enemy.fullLandBaseAirPower;
			}
		}

		// 基地の補給
		for (let i = 0; i < 3; i++) {
			const landBase = landBaseData.landBases[i];
			for (let j = 0; j < landBase.planes.length; j++) {
				const plane = landBase.planes[j];
				plane.slot = plane.fullSlot;
				plane.updateAirPower();
			}
			landBase.updateAirPower();
		}

		// 自艦隊各種スロット清算、補給
		for (let i = 0; i < fleet.ships.length; i++) {
			const ship = fleet.ships[i];
			const planesLen = ship.items.length;
			ship.airPower = 0;
			for (let j = 0; j < planesLen; j++) {
				const plane = ship.items[j];
				plane.slot = plane.fullSlot;
				plane.updateAirPower();

				ship.airPower += plane.airPower;
			}
		}
		fleet.updateAirPower();
	}

	const label = isSlotDetail ? '残機数 [機]' : '航空戦火力';
	const tooltips = {
		mode: 'index',
		callbacks: {
			title: (tooltipItem) => {
				const value = tooltipItem[0].xLabel;
				if ($('#slot_detail').prop('checked')) {
					if (!value) return `残機数：${value} 機${'\n'}航空戦火力：0`;
					const a = targetItem.getFirePower(value);
					const ap = `航空戦火力：${a.join(' or ')}`
					return `残機数：${value} 機${'\n' + ap}`;
				}
				else return `航空戦火力：${value}`;
			},
			label: (tooltipItem) => [`${tooltipItem.yLabel} %`],
		}
	}

	// 描画
	chartSlotDistribution = updateDetailChart((isSlotDetail ? slotData : fireData), label, tooltips);

	// 搭載数分布に置き換えるべ
	if (!isSlotDetail) {
		chartSlotDistribution = [];
		const max_i = getArrayMax(slotData);
		const min_i = getArrayMin(slotData);
		const maxCount = slotData.length;
		for (let i = min_i; i <= max_i; i++) {
			const num = slotData.filter(v => v === i).length;
			if (!num) continue;
			chartSlotDistribution.push({ slot: i, rate: (num / maxCount) });
		}
	}

	// 必要なら説明表示
	$('#land_base_detail_table').addClass('d-none');
	$('.detail_fire').removeClass('d-none').addClass('d-flex');
	$('.detail_wave').addClass('d-none').removeClass('d-flex');
	$('#detail_info').data('mode', 'enemy_slot_detail');
	$('#detail_info').data('base_no', enemyNo);
	$('#detail_info').data('slot_no', slotNo);
	$('#detail_info').data('battle_no', mainBattle);
	$('#detail_warning').text('※ グラフ内の航空戦火力はキャップ前でクリティカル、触接補正なし。小数切捨て');

	document.getElementById('graph_title').textContent = '';
	let planeText = '';
	let index = 0;
	let planeIndex = 0;
	for (const id of enemy.eqp) {
		const p = ENEMY_ITEM.find(v => v.id === id);
		const eSlot = enemy.slot[index];
		const isPlane = PLANE_TYPE.includes(p ? p.type : 0);

		let statusText = '';
		if (isPlane && FIGHTERS.includes(p.type)) {
			statusText = p.antiAir ? `<span class="mx-1">対空: ${p.antiAir}</span>` : '';
		}
		else if (isPlane) {
			statusText = p.antiAir ? `<span class="mx-1">対空: ${p.antiAir}</span>` : '';
			statusText += p.torpedo ? `<span class="mx-1">雷装: ${p.torpedo}</span>` : '';
			statusText += p.bomber ? `<span class="mx-1">爆装: ${p.bomber}</span>` : '';
		}

		planeText += `
		<div class="d-flex px-2 py-1 ${slotNo === planeIndex ? 'selected' : ''} ${isPlane ? `general_tr btn_show_detail` : 'disabled_detail_slot'}" data-slot_no="${planeIndex}">
			<div class="w_5 align-self-center font_size_11 text-right pr-2">${eSlot >= 0 ? eSlot : '-'}</div>
			<div class="${isPlane ? 'w_55' : 'w_90'} d-flex font_size_12 align-self-center">
				<img src="../img/type/icon${p.itype}.png" class="plane_img_sm align-self-center">
				<div class="align-self-center">${p.name}</div>
			</div>
			${isPlane ? `<div class="w_40 font_size_11 align-self-center">(${statusText})</div>` : ''}
		</div>`;

		index += 1;
		// 表示可能なものだったときのみインデックスを加算
		if (PLANE_TYPE.includes(p.type)) planeIndex += 1;
	}

	const detailLegend = `
		<img src="../img/enemy/${enemy.id}.png" class="ship_img align-self-center">
		<span class="ml-1 text-primary font_size_11 align-self-center">ID: ${enemy.id + 1500}</span>
		<span class="ml-1 font_size_12 align-self-center legend_name" data-enemyid="${enemy.id}">${enemy.name}</span>
	`;

	$('#detail_legend').html(detailLegend);
	$('#detail_info').html(planeText);

	// スロット選択欄の初期化
	const maxSlot = getArrayMax(slotData);
	if (document.getElementById('stage3_all_slot')['checked']) {
		document.getElementById('stage3_slot').value = maxSlot;
	}
	document.getElementById('stage3_all_slot_label').textContent =
		`残機数分布の結果を利用（${getArrayMin(slotData)}機 ~ ${maxSlot}機）`;

	stage3PowerCalculate();
}

/**
 * 航空戦火力計算実行と描画
 */
function stage3PowerCalculate() {
	// 計算する対象の取得
	switch ($('#detail_info').data('mode')) {
		case "enemy_slot_detail":
			$('.friend_option').addClass('d-none');
			$('.land_base_option').addClass('d-none');
			$('.fleet_option').addClass('d-none');
			document.getElementById('manual_enemy').classList.remove('d-none');
			$('.enemy_option').removeClass('d-none');
			enemyStage3PowerCalculate();
			break;
		case "fleet_slot_detail":
			$('.fleet_option').removeClass('d-none');
			$('.land_base_option').addClass('d-none');
			$('.friend_option').removeClass('d-none');
			$('.enemy_option').addClass('d-none');
			fleetStage3PowerCalculate();
			break;
		case "land_base_detail":
			$('.fleet_option').addClass('d-none');
			$('.land_base_option').removeClass('d-none');
			$('.friend_option').removeClass('d-none');
			$('.enemy_option').addClass('d-none');
			landBasePowerCalculate();
			break;
		default:
			break;
	}
}

/**
 * 航空戦火力計算に必要な各種補正、設定値の更新(全共通)　バリデーションも行う
 */
function updateAerialPowerSetting() {
	// まずは初期化
	aerialSetting = {
		item: null,
		a11: 1,
		contactBonus: 1,
		isUnion: false,
		unionBonus: 1,
		nishikiBonus: 1,
		isCritical: false,
		levelCriticalBonus: 1,
		ammoBonus: 1,
		isAllSlot: false,
		manualSlot: -1,
		manualRemodel: 0,
		targetEnemies: []
	};

	// イベント特効 6桁でバリデーション
	const inp = document.getElementById('ship_bonus').value;
	document.getElementById('ship_bonus').value = inp.length > 6 ? inp.slice(0, 6) : inp;
	aerialSetting.a11 = castFloat(inp) <= 0 ? 1 : castFloat(inp);
	// 触接補正
	aerialSetting.contactBonus = castFloat(document.getElementById('contact_bonus').value, 1);
	// クリティカル有無
	aerialSetting.isCritical = document.getElementById('critical_hit')['checked'];
	// 弾薬補正
	aerialSetting.ammoBonus = castFloat(document.getElementById('ammo_bonus').value, 1);
	// 全事象で計算をするか
	aerialSetting.isAllSlot = document.getElementById('stage3_all_slot')['checked'];
	// 指定搭載数
	aerialSetting.manualSlot = Math.min(castInt(document.getElementById('stage3_slot').value), ST3_MAX_SLOT);
	// 搭載数設定欄のバリデーションと有効無効
	document.getElementById('stage3_slot').readOnly = aerialSetting.isAllSlot;
	if (!aerialSetting.isAllSlot) {
		document.getElementById('stage3_slot').value = Math.max(aerialSetting.manualSlot, 0);
	}
	// 改修値の指定がなされている場合
	aerialSetting.manualRemodel = Math.max(Math.min(castInt(document.getElementById('stage3_remodel').value), 10), 0);
	document.getElementById('stage3_remodel').value = aerialSetting.manualRemodel;
	// 二式陸上偵察機ボーナス
	aerialSetting.nishikiBonus = document.getElementById('enabled_rikutei_z')['checked'] ? 1.15 : document.getElementById('enabled_rikutei')['checked'] ? 1.125 : 1;
}

/**
 * 基地航空隊 航空戦火力計算を行う
 */
function landBasePowerCalculate() {
	const landBaseNo = castInt($('#detail_info').data('base_no'));
	const slotNo = castInt($('#detail_info').data('slot_no'));
	// 基地オブジェクト取得
	const landBaseData = createLandBaseInstance();
	// 対象の航空隊
	const landBase = landBaseData.landBases[landBaseNo];
	// 今回調査する主役
	const targetItem = landBase.planes[slotNo];
	// 戦闘情報オブジェクト取得
	const battleInfo = updateEnemyFleetInfo(false);
	// 表示戦闘
	let mainBattle = isDefMode ? 0 : displayBattle;
	// 例外排除
	mainBattle = mainBattle < battleInfo.battles.length ? mainBattle : battleInfo.battles.length - 1;

	// 設定値の初期化
	updateAerialPowerSetting();
	// 対象機体
	aerialSetting.item = targetItem;
	// st3用敵艦隊を抽出
	const battle = castInt(document.getElementById('target_enemy').value);
	if (battle === 99) {
		// 任意敵艦
		document.getElementById('manual_enemy').classList.remove('d-none');

		const enemyId = castInt(document.getElementById('manual_enemy_id').value);
		aerialSetting.targetEnemies.push(new Enemy(enemyId));

		// あいまい検索の解析
		const words = getManualEnemySearchBox();
		for (const text of words) {
			const hits = ENEMY_DATA.filter(v => (v.id + 1500) == text || v.name.indexOf(text) >= 0);
			for (const enemy of hits) {
				// 最大12隻先着 被りなし
				if (aerialSetting.targetEnemies.length < 12 && !aerialSetting.targetEnemies.some(v => v.id === enemy.id)) {
					aerialSetting.targetEnemies.push(new Enemy(enemy.id));
				}
			}
		}
	}
	else {
		aerialSetting.targetEnemies = battleInfo.battles[battle].enemies.concat();
		document.getElementById('manual_enemy').classList.add('d-none');
	}
	// 連合艦隊かどうか
	const isUnion = battle === 99 ? document.getElementById('manual_enemy_union')['checked'] : battleInfo.battles[mainBattle].isUnion;
	aerialSetting.isUnion = isUnion;
	// 敵連合艦隊特効
	aerialSetting.unionBonus = isUnion ? 1.1 : 1;
	// 内部熟練度
	const innerLevel = getInnerProficiency(targetItem.level, targetItem.type);
	// 熟練度定数C
	const c = [0, 1, 2, 3, 4, 5, 7, 10][targetItem.level];
	// 熟練度クリティカル補正
	aerialSetting.levelCriticalBonus = 1 + Math.floor(Math.sqrt(innerLevel) + c) / 100;
	// 改修値の指定がなされている場合
	const manualRemodel = aerialSetting.manualRemodel;
	if (manualRemodel >= 0) targetItem.remodel = manualRemodel;
	// 弾薬補正 なし
	aerialSetting.ammoBonus = 1;

	// 描画
	drawStage3Result();
}

/**
 * 味方艦隊 航空戦火力計算を行う
 */
function fleetStage3PowerCalculate() {
	const shipNo = castInt($('#detail_info').data('base_no'));
	const slotNo = castInt($('#detail_info').data('slot_no'));
	// 味方艦隊オブジェクト取得
	const fleet = createFleetInstance();
	// 対象の艦娘
	const shipInstance = fleet.ships[shipNo];
	// 今回調査する主役
	const targetItem = shipInstance.items[slotNo];
	// 戦闘情報オブジェクト取得
	const battleInfo = updateEnemyFleetInfo(false);
	// 表示戦闘
	let mainBattle = isDefMode ? 0 : displayBattle;
	// 例外排除
	mainBattle = mainBattle < battleInfo.battles.length ? mainBattle : battleInfo.battles.length - 1;

	// 設定値の初期化
	updateAerialPowerSetting();
	// 対象機体
	aerialSetting.item = targetItem;
	// st3用敵艦隊を抽出
	const battle = castInt(document.getElementById('target_enemy').value);
	if (battle === 99) {
		// 任意敵艦
		document.getElementById('manual_enemy').classList.remove('d-none');
		const enemyId = castInt(document.getElementById('manual_enemy_id').value);
		const enemy = new Enemy(enemyId);
		// まず連合かどうか
		aerialSetting.isUnion = document.getElementById('manual_enemy_union')['checked'];

		if (aerialSetting.isUnion) {
			// 連合の護衛か
			enemy.isEscort = document.getElementById('manual_union_escort')['checked'];
			document.getElementById('manual_union_main').parentElement.classList.remove('d-none');
			document.getElementById('manual_union_escort').parentElement.classList.remove('d-none');
		}
		else {
			// 非連合なら無効化
			document.getElementById('manual_union_main').parentElement.classList.add('d-none');
			document.getElementById('manual_union_escort').parentElement.classList.add('d-none');
		}

		const isEscort = aerialSetting.isUnion && enemy.isEscort;
		aerialSetting.targetEnemies.push(enemy);

		// あいまい検索の解析
		const words = getManualEnemySearchBox();
		for (const text of words) {
			const hits = ENEMY_DATA.filter(v => (v.id + 1500) == text || v.name.indexOf(text) >= 0);
			for (const enemy of hits) {
				// 最大12隻先着 被りなし
				if (aerialSetting.targetEnemies.length < 12 && !aerialSetting.targetEnemies.some(v => v.id === enemy.id)) {
					const enm = new Enemy(enemy.id);
					enm.isEscort = isEscort;
					aerialSetting.targetEnemies.push(enm);
				}
			}
		}
	}
	else {
		aerialSetting.targetEnemies = battleInfo.battles[battle].enemies.concat();
		document.getElementById('manual_enemy').classList.add('d-none');

		// 敵が連合艦隊か？
		aerialSetting.isUnion = battleInfo.battles[battle].isUnion;
	}

	// 熟練度クリティカル補正
	aerialSetting.levelCriticalBonus = shipInstance.getProfCriticalBonus();
	// 改修値の指定がなされている場合
	const manualRemodel = aerialSetting.manualRemodel;
	if (manualRemodel >= 0) targetItem.remodel = manualRemodel;

	// 描画
	drawStage3Result();
}

/**
 * 敵艦隊 航空戦火力計算を行う
 */
function enemyStage3PowerCalculate() {
	const enemyNo = castInt($('#detail_info').data('base_no'));
	const slotNo = castInt($('#detail_info').data('slot_no'));
	// 味方艦隊オブジェクト取得
	const fleet = createFleetInstance();
	// 戦闘情報オブジェクト取得
	const battleInfo = updateEnemyFleetInfo(false);
	// 表示戦闘
	let mainBattle = isDefMode ? 0 : displayBattle;
	// 例外排除
	mainBattle = mainBattle < battleInfo.battles.length ? mainBattle : battleInfo.battles.length - 1;
	// 今回の記録用の敵データ
	const targetEnemy = battleInfo.battles[mainBattle].enemies.filter(v => v.slots.length > 0 && !v.onlyScout)[enemyNo];
	const enemy = ENEMY_DATA.find(v => v.id === targetEnemy.id);
	// slotNo は艦載機だけの配列で見ている => 艦載機のみ配列を作る enemy.eqp.filter()
	const planes = enemy.eqp.map(v => ENEMY_ITEM.find(x => x.id === v));
	const plane = planes.filter(v => FIGHTERS.includes(v.type) || ATTACKERS.includes(v.type))[slotNo];
	// 今回調査する機体データ
	const targetItem = new EnemyItem(plane.id);

	// 設定値の初期化
	updateAerialPowerSetting();
	// 対象機体
	aerialSetting.item = targetItem;
	// 弾薬補正 なし
	aerialSetting.ammoBonus = 1;

	// 耐久改修
	const hpBuff1 = document.getElementById('hp_1')['checked'];
	const hpBuff2 = document.getElementById('hp_2')['checked'];

	// st3用敵艦隊を抽出
	const stage3Fleet = fleet.ships.concat();
	for (const ship of stage3Fleet) {
		const raw = SHIP_DATA.find(v => v.id === ship.id);
		if (!raw) continue;
		// 必要なのは名前 id 艦種 耐久 装甲のみでOK
		ship.type = raw.type;
		ship.hp = ship.level >= 100 ? raw.hp2 : raw.hp;
		if (hpBuff1) ship.hp++;
		if (hpBuff2) ship.hp++;
		if (ship.hp >= raw.max_hp) ship.hp = raw.max_hp;
		ship.armor = raw.max_armor;
		ship.sumItemArmor = getArraySum(ship.items.map(v => v.armor));
	}
	// 防御艦隊の設定
	aerialSetting.targetEnemies = stage3Fleet;
	// 連合艦隊かどうか
	aerialSetting.isUnion = fleet.isUnion;
	// 描画
	drawStage3Result();
}

/**
 * 航空戦火力計算結果の表示
 */
function drawStage3Result() {
	/** @type {Enemy[]} */
	const enemies = aerialSetting.targetEnemies;
	/** @type {Item} 機体 */
	const plane = aerialSetting.item;
	// 各特殊補正用のフラグをチェック
	// 防御側が敵艦かどうか => とりあえずequipmentsプロパティを持つかで判定
	const isFleet = enemies.length > 0 && enemies[0].hasOwnProperty('equipments');
	// 基地航空隊フラグ
	const isLandBase = plane.hasOwnProperty('defenseAirPower');
	// 陸攻チェック
	const isLandBaseAttacker = plane.type === 47;
	// 対潜攻撃チェック
	const enabledASW = isLandBase && enemies.some(v => v.type.includes(18)) && plane.asw >= 7;
	// 搭載数指定
	const selectedSlot = Math.min(castInt(document.getElementById('stage3_slot').value), ST3_MAX_SLOT);
	// 弾薬補正
	const ammoBonus = aerialSetting.ammoBonus;

	// 噴式オプション表示非表示
	if (isFleet && !isLandBase && plane.isJet) {
		$('.jet_option').removeClass('d-none');
	}
	else {
		$('.jet_option').addClass('d-none');
	}
	// 噴式強襲モードフラグ
	const isJetMode = isFleet && !isLandBase && plane.isJet && document.getElementById('jet_phase')['checked'];

	// 全事象でやるかどうか
	const isAllSlot = aerialSetting.isAllSlot;
	// 結果表示用
	let tbodyText = '';

	// 搭載数確率分布
	const slotDist = chartSlotDistribution;

	for (let i = 0; i < enemies.length; i++) {
		const enemy = enemies[i];
		if (enemy.id <= 0) continue;
		const armor = enemy.armor + enemy.sumItemArmor;

		// 最終攻撃力火力分布
		let lastPowers = [];

		// 基地航空隊ダメージ計算
		if (isLandBase) {
			if (enemy.type.includes(2)) {
				// 基地航空隊 対地攻撃
				lastPowers = getLandBaseAerialPowersLandBase(slotDist, enemy);
			}
			else if (enemy.type.includes(18) && enabledASW) {
				// 基地航空隊 対潜攻撃
				lastPowers = getLandBaseASWPower(slotDist);
			}
			else if (isLandBaseAttacker && (enemy.id === 86 || enemy.id === 120)) {
				// 基地航空隊 陸攻 空母棲姫特効(キャップ後3.2倍)
				lastPowers = getLandBaseAerialPowers(slotDist, 1, 3.2);
			}
			else {
				// 基地航空隊 対水上
				if (enemy.type.includes(16)) {
					// 駆逐
					if (plane.id === 224) {
						// 65戦隊特殊
						lastPowers = getLandBaseAerialPowers(slotDist, 1, 1, 1, true);
					}
					else if (plane.id === 405) {
						// Do 217 E-5+Hs293 雷装1.1倍
						lastPowers = getLandBaseAerialPowers(slotDist, 1, 1, 1.1);
					}
					else if (plane.id === 444) {
						// 四式重爆 飛龍+イ号一型甲 誘導弾 雷装1.15倍
						lastPowers = getLandBaseAerialPowers(slotDist, 1, 1, 1.15);
					}
				}
				else if (enemy.type.includes(13)) {
					// 戦艦
					if (plane.id === 406) {
						// Do 217 K-2 + Fritz-X 1.35倍
						lastPowers = getLandBaseAerialPowers(slotDist, 1.35);
					}
					else if (plane.id === 444) {
						// 四式重爆 飛龍+イ号一型甲 誘導弾 雷装1.15倍
						lastPowers = getLandBaseAerialPowers(slotDist, 1, 1, 1.15);
					}
				}
				else if (enemy.type.includes(12) || enemy.type.includes(14) || enemy.type.includes(15) || enemy.type.includes(17)) {
					// 順に 軽空母 軽巡 重巡 雷巡
					if (plane.id === 444) {
						// 四式重爆 飛龍+イ号一型甲 誘導弾 雷装1.15倍
						lastPowers = getLandBaseAerialPowers(slotDist, 1, 1, 1.15);
					}
				}

				if (!lastPowers.length) {
					// それ以外
					lastPowers = getLandBaseAerialPowers(slotDist);
				}
			}
		}
		else if (isFleet) {
			// 味方艦隊 通常
			lastPowers = getFleetAerialPower(slotDist, enemy, 1, isJetMode);
		}
		else {
			// 敵艦隊（防御側が味方艦隊） 通常
			lastPowers = getEnemyAerialPowers(slotDist, enemy);
		}

		// 耐久
		const HP = enemy.hp;
		// 各ダメージ分布
		const damageDist = createDamageDistribution(lastPowers, armor, ammoBonus, isFleet, HP);
		// ダメージ配列のみ抽出
		const damages = damageDist.map(v => v.damage);
		// 最低 最大ダメ
		const minDamage = getArrayMin(damages);
		const maxDamage = getArrayMax(damages);

		// 各損傷状態必要ダメージボーダーとその確率 [死, 大, 中, 小]
		const damageBorders = [
			{ min: HP, max: getArrayMax(damageDist.map(v => v.damage)) + 1, value: 0 },
			{ min: Math.ceil(HP * 0.75), max: HP, value: 0 },
			{ min: Math.ceil(HP * 0.5), max: Math.ceil(HP * 0.75), value: 0 }
		];
		// 全滅(火力0)があるなら最低ダメージを割合としない
		const existNone = lastPowers.map(v => v.power).some(v => v <= 0);
		let damageRange = `${minDamage >= 1 ? minDamage : existNone ? '0' : '割合'}~${maxDamage >= 1 ? maxDamage : '割合'}`;
		if (!isAllSlot && selectedSlot === 0) damageRange = '-';
		let damageRateText = '';
		for (let j = 0; j < damageBorders.length; j++) {
			const obj = damageBorders[j];
			const borderMin = obj.min;
			const borderMax = obj.max;
			// 各損傷状態を満たすボーダーを上回る確率を合計したもの => つまり〇〇率
			const okPowers = damageDist.filter(v => v.damage >= borderMin && v.damage < borderMax).map(v => v.rate);
			const rate = okPowers.length === damageDist.length ? 1 : getArraySum(okPowers);
			obj.value = rate;

			// 非攻撃機
			if (!plane.isAttacker) {
				// 敗者復活(敵が潜水かつ対潜可能)
				if (isFleet && (!enemy.type.includes(18) || !enabledASW)) {
					damageRateText += `<td>-</td>`;
					damageRange = '';
					continue;
				}
			}
			if ((isFleet && enemy.type.includes(18) && !enabledASW) || (!isFleet && [13, 14].includes(enemy.type))) {
				// 敵が潜水艦で対潜不可なら 表示なし
				damageRateText += `<td class="text-center" colspan="${damageBorders.length}">対潜攻撃不可</td>`;
				damageRange = '';
				for (const data of damageBorders) data.value = 0;
				break;
			}

			if (rate === 1 && j === 0 && !isAllSlot) {
				// 確殺！
				damageRateText += `<td colspan="${damageBorders.length}" class="text-center text_red">確殺</td>`;
				break;
			}
			else if (rate === 1) {
				// 100％
				damageRateText += `<td>100 <span class="font_size_11 font_color_half">%</span></td>`;
			}
			else {
				const dispRate = Math.floor(rate * 1000) / 10;
				// 本当に0なら0%　ちょっとでもあるなら0.1に補正
				damageRateText += `<td>${dispRate === 0 && rate !== 0 ? 0.1 : dispRate} <span class="font_size_11 font_color_half">%</span></td>`;
			}
		}

		const deathRate = Math.floor((damageBorders[0].value) * 1000) / 10;
		const taihaRate = Math.floor((damageBorders[0].value + damageBorders[1].value) * 1000) / 10;
		const tyuhaRate = Math.floor((damageBorders[0].value + damageBorders[1].value + damageBorders[2].value) * 1000) / 10;

		const tooltipText = `
		<div class='text-left'>
			<div>${enemy.name}</div>
			<div class='mt-1 ml-3'>大破以上: ${taihaRate} %</div>
			<div class='ml-3'>中破以上: ${tyuhaRate} %</div>
		</div>`;

		tbodyText += `
		<tr class="stage3_calc_detail ${deathRate >= 90 ? 'tr_death' : taihaRate >= 70 ? 'tr_damaged' : tyuhaRate >= 50 ? 'tr_half_damaged' : ''}"
			data-toggle="tooltip" data-html="true" title="${tooltipText}">
			<td class="px-0">
				<img class="enemy_img_sm" src="../img/${isFleet ? 'enemy' : 'ship'}/${enemy.id}.png">
			</td>
			<td>${HP}</td>
			<td>${armor}</td>
			<td>${damageRange ? damageRange : '-'}</td>
			${damageRateText}
		</tr>`;
	}

	$('.stage3_calc_detail').tooltip('dispose');
	document.getElementById('stage3_table_tbody').innerHTML = tbodyText;
	document.getElementById('target_plane_data').innerHTML = `
		<img src="../img/type/icon${plane.itype}.png" class="plane_img_sm align-self-center">
		<div class="ml-1 align-self-center detail_item_name"><span class="ml-1">${plane.name}</span></div>`;
	document.getElementById('stage3_remodel').value = plane.remodel;
	$('.stage3_calc_detail').tooltip();
}

/**
 * 基地航空隊 対水上艦航空戦火力分布を返却
 * @param {{slot: number, rate: number}[]} slotDist
 * @param {number} [beforCapBonus=1] キャップ前補正(あれば)
 * @param {number} [afterCapBonus=1] キャップ後補正(あれば)
 * @param {number} [torpedoBpnus=1] 雷装値補正(あれば)
 * @param {boolean} [isSpecial=false] 65戦隊特殊
 * @returns 
 */
function getLandBaseAerialPowers(slotDist, beforCapBonus = 1, afterCapBonus = 1, torpedoBpnus = 1, isSpecial = false) {
	/** @type {LandBaseItem} */
	const plane = aerialSetting.item;
	const isCritical = aerialSetting.isCritical;
	const crBonus = aerialSetting.levelCriticalBonus;
	const isAllSlot = aerialSetting.isAllSlot;
	const manualSlot = aerialSetting.manualSlot;
	// キャップ後補正まとめ (二式陸偵補正 * 触接補正 * 対連合補正 * キャップ後特殊補正)
	const allBonus = aerialSetting.nishikiBonus * aerialSetting.contactBonus * aerialSetting.unionBonus * afterCapBonus;
	const powers = [];
	for (const dist of slotDist) {
		// 調査搭載数
		const slot = isAllSlot ? dist.slot : manualSlot;
		// クリティカル & 陸攻補正を行った攻撃力
		const basePower = isSpecial ? LandBaseItem.getFirePower_SP(plane, slot, isCritical, crBonus) :
			LandBaseItem.getFirePower(plane.id, slot, plane.remodel, isCritical, crBonus, beforCapBonus, torpedoBpnus);
		// 全事象(isAllSlot)なら各搭載数の取り得る確率を使用する
		const rate = isAllSlot ? dist.rate : 1;
		// 陸偵補正 * 触接補正 * 敵連合補正を付与
		const a = basePower * allBonus;
		// 火力とその確率を格納
		const p = powers.find(v => v.power === a);
		if (p) p.rate += rate;
		else powers.push({ power: a, rate: rate });

		// 搭載数指定モードの場合は1回で抜ける
		if (!isAllSlot) break;
	}
	return powers;
}

/**
 * 基地航空隊 対陸上基地 航空戦火力分布を返却
 * @param {{slot: number, rate: number}[]} slotDist
 * @param {Enemy} enemy 敵艦
 * @param {number} [afterCapBonus=1] キャップ後補正(あれば)
 */
function getLandBaseAerialPowersLandBase(slotDist, enemy, afterCapBonus = 1) {
	/** @type {LandBaseItem} */
	const plane = aerialSetting.item;
	const isCritical = aerialSetting.isCritical;
	const crBonus = aerialSetting.levelCriticalBonus;
	const isAllSlot = aerialSetting.isAllSlot;
	const manualSlot = aerialSetting.manualSlot;
	// キャップ後補正まとめ (二式陸偵補正 * 触接補正 * 対連合補正 * キャップ後特殊補正)
	const allBonus = aerialSetting.nishikiBonus * aerialSetting.contactBonus * aerialSetting.unionBonus * afterCapBonus;
	const powers = [];
	for (const ad of slotDist) {
		// 調査搭載数
		const slot = isAllSlot ? ad.slot : manualSlot;
		// クリティカル & 陸攻補正を行った攻撃力
		const basePower = LandBaseItem.getFirePowerLandBase(plane, slot, isCritical, crBonus, enemy);
		// 全事象(isAllSlot)なら各搭載数の取り得る確率を使用する
		const rate = isAllSlot ? ad.rate : 1;
		// 陸偵補正 * 触接補正 * 敵連合補正を付与
		const a = basePower * allBonus;
		// 火力とその確率を格納
		const p = powers.find(v => v.power === a);
		if (p) p.rate += rate;
		else powers.push({ power: a, rate: rate });

		// 搭載数指定モードの場合は1回で抜ける
		if (!isAllSlot) break;
	}
	return powers;
}

/**
 * 基地航空隊 対潜攻撃 航空戦火力分布を返却
 * @param {{slot: number, rate: number}[]} slotDist
 * @param {number} [afterCapBonus=1] キャップ後補正(あれば)
 */
function getLandBaseASWPower(slotDist, afterCapBonus = 1) {
	/** @type {LandBaseItem} */
	const plane = aerialSetting.item;
	const isCritical = aerialSetting.isCritical;
	const crBonus = aerialSetting.levelCriticalBonus;
	const isAllSlot = aerialSetting.isAllSlot;
	const manualSlot = aerialSetting.manualSlot;
	// キャップ後補正まとめ (触接補正 * キャップ後特殊補正)
	const allBonus = aerialSetting.contactBonus * afterCapBonus;
	const powers = [];
	for (const ad of slotDist) {
		// 調査搭載数
		const slot = isAllSlot ? ad.slot : manualSlot;
		// 基本攻撃力 = {対潜 × √(1.8 × 搭載数) + 25} × {A + (0 ~ Bの乱数)}
		const base = slot > 0 ? plane.asw * Math.sqrt(1.8 * slot) + 25 : 0;
		// A 対潜10以上で0.7 それ以外0.35
		const a = plane.asw >= 10 ? 0.7 : 0.35;
		// B 対潜10以上で0.3、それ以外0.45
		const bMax = plane.asw >= 10 ? 0.3 : 0.45;
		// 1事象あたりの確率
		const rateStep = 1 / (bMax * 100 + 1);
		// 0.01刻みの乱数と仮定する
		for (let b = 0; b <= bMax * 100; b++) {
			// 全事象(isAllSlot)なら各搭載数の取り得る確率を使用する
			const rate = isAllSlot ? ad.rate * rateStep : rateStep;
			// 基本攻撃力 = {対潜 × √(1.8 × 搭載数) + 25} × {A + (0 ~ Bの乱数)}（再掲）
			let basePower = Math.floor(softCap(base * (a + (b / 100)), AS_CAP));
			// クリティカル補正
			if (isCritical) basePower = Math.floor(basePower * 1.5 * crBonus);
			// 陸攻補正 * 触接補正付与
			let power = basePower * (plane.type === 47 ? 1.8 : 1) * allBonus;
			// 水上偵察機攻撃力 0 補正
			if (RECONNAISSANCES.includes(plane.type)) power = 1;
			// 火力とその確率を格納
			const p = powers.find(v => v.power === power);
			if (p) p.rate += rate;
			else powers.push({ power: power, rate: rate });
		}
		// 搭載数指定モードの場合は1回で抜ける
		if (!isAllSlot) break;
	}
	return powers;
}

/**
 * 基地航空隊 対陸上基地 航空戦火力分布を返却
 * @param {{slot: number, rate: number}[]} slotDist
 * @param {Enemy} enemy 敵艦
 * @param {number} [afterCapBonus=1] キャップ後補正(あれば)
 * @param {boolean} [isJetMode=false] 噴式強襲モードか
 */
function getFleetAerialPower(slotDist, enemy, afterCapBonus = 1, isJetMode = false) {
	/** @type {ShipItem} */
	const plane = aerialSetting.item;
	const isCritical = aerialSetting.isCritical;
	const crBonus = aerialSetting.levelCriticalBonus;
	const isAllSlot = aerialSetting.isAllSlot;
	const manualSlot = aerialSetting.manualSlot;
	const isUnion = aerialSetting.isUnion;
	// キャップ後補正まとめ (触接補正 * イベント特効(a11) * キャップ後特殊補正)
	const allBonus = aerialSetting.contactBonus * aerialSetting.a11 * afterCapBonus;
	// 最終火力の確率分布
	const powers = [];
	for (const ad of slotDist) {
		// 調査搭載数
		const slot = isAllSlot ? ad.slot : manualSlot;
		// キャップ後攻撃力
		const basePower = ShipItem.getFirePower(plane, slot, isUnion, enemy.isEscort, isJetMode);
		// キャップ後火力が複数ある場合に確率を分ける => 艦攻なら0.5 他は1
		const step = 1 / basePower.length;
		// 全事象(isAllSlot)なら各搭載数の取り得る確率を使用する
		const rate = isAllSlot ? ad.rate * step : step;
		for (const power of basePower) {
			// A = キャップ後攻撃力 * 触接補正 * 特効補正
			let a = power * allBonus;
			// クリティカル補正　適用後に切り捨て
			a = isCritical ? Math.floor(a * 1.5 * crBonus) : a;

			// 火力とその確率を格納
			const p = powers.find(v => v.power === a);
			if (p) p.rate += rate;
			else powers.push({ power: a, rate: rate });
		}

		// 搭載数指定モードの場合は1回で抜ける
		if (!isAllSlot) break;
	}
	return powers;
}

/**
 * 基地航空隊 対陸上基地 航空戦火力分布を返却
 * @param {{slot: number, rate: number}[]} slotDist
 * @param {Enemy} ship 防御側艦娘
 * @param {number} [afterCapBonus=1] キャップ後補正(あれば)
 */
function getEnemyAerialPowers(slotDist, ship, afterCapBonus = 1) {
	/** @type {EnemyItem} */
	const plane = aerialSetting.item;
	const isCritical = aerialSetting.isCritical;
	const crBonus = aerialSetting.levelCriticalBonus;
	const isAllSlot = aerialSetting.isAllSlot;
	const manualSlot = aerialSetting.manualSlot;
	const isUnion = aerialSetting.isUnion;
	// キャップ後補正まとめ (触接補正 * キャップ後特殊補正)
	const allBonus = aerialSetting.contactBonus * afterCapBonus;
	// 最終火力の確率分布
	const powers = [];
	for (const ad of slotDist) {
		// 調査搭載数
		const slot = isAllSlot ? ad.slot : manualSlot;
		// キャップ後攻撃力
		const basePower = plane.getFirePower(slot, isUnion, ship.isEscort);
		// キャップ後火力が複数ある場合に確率を分ける => 艦攻なら0.5 他は1
		const step = 1 / basePower.length;
		// 全事象(isAllSlot)なら各搭載数の取り得る確率を使用する
		const rate = isAllSlot ? ad.rate * step : step;
		for (const power of basePower) {
			// A = キャップ後攻撃力 * 触接補正
			let a = power * allBonus;
			// クリティカル補正　適用後に切り捨て
			a = isCritical ? Math.floor(a * 1.5 * crBonus) : a;

			// 火力とその確率を格納
			const p = powers.find(v => v.power === a);
			if (p) p.rate += rate;
			else powers.push({ power: a, rate: rate });
		}

		// 搭載数指定モードの場合は1回で抜ける
		if (!isAllSlot) break;
	}

	return powers;
}

/**
 * 航空戦計算機　敵艦種選択
 */
function manual_enemy_type_Changed() {
	const type = castInt(document.getElementById('manual_enemy_type').value);
	const parent = document.getElementById('manual_enemy_id');
	const enemies = ENEMY_DATA.filter(v => v.type.includes(type));

	parent.innerHTML = '';
	for (const enemy of enemies) {
		const opt = document.createElement('option');
		opt.value = enemy.id;
		opt.textContent = `id: ${enemy.id + 1500} ${enemy.name}`;

		parent.appendChild(opt);
	}

	parent.options[0].selected = true;
	stage3PowerCalculate();
}

/**
 * 航空戦計算機 自由敵艦あいまい検索の解析
 * @returns {string[]}
 */
function getManualEnemySearchBox() {
	/** @type {string} */
	let input = document.getElementById('manual_enemy_search').value.trim();
	// 区切り文字への置き換え
	input = input.replace(/\s+/g, ',');
	input = input.replace(/[、]/g, ',');

	const searchWords = [];
	for (const word of input.split(',')) {
		if (word && !searchWords.includes(word)) {
			searchWords.push(word);
		}
	}

	return searchWords;
}

/**
 * 最終火力と敵艦を渡すと各ダメージ確率分布を返却
 * @param {{power: number, rate: number}[]} powers 最終攻撃力分布
 * @param {number} armor 装甲
 * @param {number} ammoRate 弾薬補正値
 * @param {boolean} isEnemy 防御側の艦船が敵艦かどうか
 * @param {number} HP 最大耐久値
 * @returns {{damage: number, rate: number}[]} ダメージ確率分布
 */
function createDamageDistribution(powers, armor, ammoRate, isEnemy, HP) {
	// 各ダメージ値とその確率のdictionary
	const damageDist = [];

	// 0　～　(装甲 - 1)まで
	const step = 1 / armor;
	for (let i = 0; i < armor; i++) {
		const tempArmor = armor * 0.7 + i * 0.6;
		for (const p of powers) {
			// 最終ダメージ 0以下は0にする
			const damage = p.power - tempArmor > 0 ? Math.floor((p.power - tempArmor) * ammoRate) : 0;
			if (damage >= HP && !isEnemy) {
				// 味方艦隊 撃沈してしまう時ダメージ置換
				const step2 = 1 / HP;
				for (let j = 0; j < HP; j++) {
					// 被ダメージ = [現在HP × 0.5 + 整数乱数(0 ～ 現在HP-1) × 0.3](端数切捨て)
					const damage2 = Math.floor(HP * 0.5 + j * 0.3);
					const rate = step * p.rate * step2;
					const data = damageDist.find(v => v.damage === damage2);
					if (data) {
						// あれば加算
						data.rate += rate;
					}
					else {
						// なければ初期化
						damageDist.push({ damage: damage2, rate: rate });
					}
				}
			}
			else {
				const rate = step * p.rate;
				const data = damageDist.find(v => v.damage === damage);
				if (data) {
					// あれば加算
					data.rate += rate;
				}
				else {
					// なければ初期化
					damageDist.push({ damage: damage, rate: rate });
				}
			}
		}
	}

	return damageDist;
}

/**
 * グラフ更新 なければ作成
 * @param {number[]} data 表示データセット
 * @param {string} xLabelString x軸
 * @param {object} tooltips ツールチップオブジェクト
 * @returns {{slot: number, rate: number}[]} 各スロットの確率分布
 */
function updateDetailChart(data, xLabelString, tooltips) {
	// 描画
	const xLabels = [], actualData = [], rateData = [], returnData = [];
	const max_i = getArrayMax(data);
	const min_i = getArrayMin(data);
	const maxCount = data.length;
	let par50 = 0, par90 = 0, par95 = 0, par99 = 0, sumRate = 0;
	for (let i = min_i; i <= max_i; i++) {
		const num = data.filter(v => v === i).length;
		if (!num) continue;
		xLabels.push(i);
		actualData.push((100 * num / maxCount).toFixed(maxCount >= 100000 ? 5 : maxCount >= 10000 ? 4 : maxCount >= 1000 ? 3 : 2));
		returnData.push({ slot: i, rate: (num / maxCount) });
		sumRate += 100 * num / maxCount;
		rateData.push(sumRate.toFixed(1));
		if (!par50 && sumRate >= 50) par50 = i;
		if (!par90 && sumRate >= 90) par90 = i;
		if (!par95 && sumRate >= 95) par95 = i;
		if (!par99 && sumRate >= 99) par99 = i;
	}

	// 90%区間とか
	$('#detail_max').text(max_i);
	$('#detail_min').text(min_i);
	$('#detail_50').text(par50);
	$('#detail_90').text(par90);
	$('#detail_95').text(par95);
	$('#detail_99').text(par99);

	if (!chartInstance) {
		// 初回
		const ctx = document.getElementById("detailChart");

		const textColor = "rgba(" + hexToRGB(mainColor).join(',') + ", 0.8)";
		chartInstance = new Chart(ctx, {
			type: "bar",
			data: {
				labels: xLabels,
				datasets: [{
					label: "確率分布",
					data: actualData,
					borderColor: "rgb(255, 70, 100)",
					backgroundColor: "rgba(255, 120, 180, 0.4)",
					yAxisID: "y-axis-1",
				},
				{
					label: "累積確率",
					data: rateData,
					type: "line",
					fill: false,
					borderColor: "rgb(54, 162, 255)",
					yAxisID: "y-axis-2",
				}]
			},
			options: {
				responsive: true,
				scales: {
					xAxes: [{
						scaleLabel: { display: true, labelString: xLabelString, fontColor: textColor },
						gridLines: { display: false },
						ticks: { fontSize: 10, fontColor: textColor }
					}],
					yAxes: [{
						id: "y-axis-1",
						type: "linear",
						position: "left",
						gridLines: { display: true, color: "rgba(128, 128, 128, 0.2)" },
						scaleLabel: { display: true, labelString: '確率分布 [％]', fontColor: textColor },
						ticks: { min: 0, fontColor: textColor },
					},
					{
						id: "y-axis-2",
						type: "linear",
						position: "right",
						gridLines: { display: true, color: "rgba(128, 128, 128, 0.2)" },
						scaleLabel: { display: true, labelString: '累積確率 [％]', fontColor: textColor },
						ticks: { max: 100, min: 0, stepSize: 25, fontColor: textColor },
					}],
				},
				legend: {
					display: true,
					labels: { fontColor: textColor }
				},
				tooltips: tooltips
			}
		});
	}
	else {
		// グラフ更新
		chartInstance.data.labels = xLabels;
		chartInstance.data.datasets[0].data = actualData;
		chartInstance.data.datasets[1].data = rateData;
		chartInstance.options.scales.xAxes[0].scaleLabel.labelString = xLabelString;
		chartInstance.options.tooltips = tooltips;

		chartInstance.update();
	}

	return returnData.concat();
}

/*==================================
		イベント処理
==================================*/

/**
 * 各種モーダル終了時イベント
 * @param {JQuery} $this
 */
function modal_Closed($this) {
	// いらないオブジェクト参照をやめさせる
	switch ($this.attr('id')) {
		case "modal_share":
			const $output = $('#output_deck');
			$output.val('');
			$output.nextAll('.valid-feedback').text('');
			$output.removeClass('is-invalid').removeClass('is-valid');

			const $outputUrl = $('#output_url');
			$outputUrl.val('');
			$outputUrl.nextAll('.valid-feedback').text('');
			$outputUrl.removeClass('is-invalid').removeClass('is-valid');

			$target = null;
			calculate();
			break;
		case "modal_ship_select":
		case "modal_plane_select":
		case "modal_enemy_select":
		case "modal_enemy_pattern":
		case "modal_collectively_setting":
		case "modal_lb_target":
		case "modal_level_input":
		case "modal_luck_input":
		case "modal_fleet_antiair_input":
			$target = null;
			calculate();
			break;
		case "modal_plane_preset":
			$target = null;
			planePreset = null;
			calculate(true, true, false);
			break;
		case "modal_result_detail":
			setTimeout(() => {
				chartInstance.destroy();
				chartInstance = null;
				chartSlotDistribution = null;
				document.getElementById('target_enemy').value = -1;
			}, 80);
			break;
		case "modal_contact_detail":
			setTimeout(() => {
				chartInstance.destroy();
				chartInstance = null;
				if (subChartInstance) {
					subChartInstance.destroy();
					subChartInstance = null;
				}
			}, 80);
			break;
		case "modal_main_preset":
			// ボタンモードを戻す
			$('#modal_main_preset').find('.btn_commit_preset').text('編成保存');
			$('#modal_main_preset').find('.btn_commit_preset').removeClass('rename');
			// アップロード非チェック
			$('#allow_upload_preset').prop('checked', false);
			$('#btn_upload_preset').addClass('d-none');
			break;
		case "modal_preset_memo":
			// アクティブタブのメモに反映
			const activePreset = getActivePreset();
			if (activePreset) {
				activePreset.memo = document.getElementById('preset_memo').value.trim();
				updateActivePreset(activePreset);
			}
			break;
		case "modal_confirm":
			if (confirmType === 'Error') {
				try {
					window.location.reload(true);
				} catch (error) {
					window.location.href = '../list/';
				}
			}
			confirmType = null;
			break;
		case "modal_ship_reserve":
			currentReserved = null;
			$target = null;
			calculate(false, true, false);
			break;
		case "modal_reference":
			window.history.replaceState(null, null, location.pathname);
			break;
		case "modal_include_selector":
			loadedDeckBuilders = [];
			break;
		default:
			break;
	}
}

/**
 * 大コンテンツ入れ替えモード起動ボタンクリック時
 * @param {JQuery} $this
 */
function btn_content_trade_Clicked($this) {
	$('body,html').animate({ scrollTop: 0 }, 200, 'swing');
	$('.btn_commit_trade').addClass('d-flex').removeClass('d-none');
	$('.r_btn:not(.btn_commit_trade)').addClass('d-none').removeClass('d-lg-flex');
	// 開始時にいったん全部最小化、handle追加
	$('#main').find('.collapse_content').each(function () {
		$(this).parent().addClass('trade_enabled');
		if ($(this).attr('class').includes('show')) {
			$(this).addClass('tmpHide').collapse('hide');
		}
	});
	$this.blur();
}

/**
 * 大コンテンツ入れ替え処理終了時
 */
function main_contents_Sortable_End() {
	setting.contentsOrder = [];
	$('#main > div:not(#main_footer)').each((i, e) => {
		const contentId = $(e).attr('id');
		setting.contentsOrder.push(contentId);
	});

	saveSetting();
}

/**
 * 大コンテンツ入れ替え完了クリック時
 */
function commit_content_order() {
	// 動作中はキャンセル
	if ($('#landBase_content').hasClass('collapsing')) return false;

	// 一時閉じていたやつは終了時に展開 -> 機体ドラッグ時位置ずれバグあり　要検証
	$('.tmpHide').collapse('show');
	// handle解除
	$('.trade_enabled').removeClass('trade_enabled');
	$('.btn_commit_trade').addClass('d-none').removeClass('d-flex');
	$('.r_btn:not(.btn_commit_trade)').removeClass('d-none');
}

/**
 * 一括設定クリック時
 * @param {JQuery} $this
 */
function btn_ex_setting_Clicked($this) {
	const parentId = $this.closest('.contents').attr('id');
	const $modal = $('#modal_collectively_setting');

	$modal.find('.btn').removeClass('d-none');
	$modal.data('target', parentId);
	switch (parentId) {
		case 'landBase':
			$modal.find('.modal-title').text('一括設定　-基地航空隊-');
			$modal.find('.btn_remove_ship_all').addClass('d-none');
			$modal.find('.btn_remove_enemy_all').addClass('d-none');
			$modal.find('.btn_slot_default').addClass('d-none');
			$modal.find('.coll_slot_range').attr('max', 18).data('target', parentId);
			break;
		case 'friendFleet':
			$modal.find('.modal-title').text('一括設定　-艦娘-');
			$modal.find('.btn_remove_enemy_all').addClass('d-none');
			$modal.find('.coll_slot_range').attr('max', 99).data('target', parentId);
			break;
		default:
			break;
	}

	$modal.modal('show');
}

/**
 * 特効表示形式変更時
 */
function display_special_Changed($this) {
	if ($this[0] === document.getElementById('display_special_A')) {
		specialOperator.update('A');
		document.getElementById('disp_special_parent').classList.remove('d-none');
	}
	else if ($this[0] === document.getElementById('display_special_B')) {
		specialOperator.update('B');
		document.getElementById('disp_special_parent').classList.remove('d-none');
	}
	else {
		specialOperator.update('');
		document.getElementById('disp_special_parent').classList.add('d-none');
	}
	// いったん全部装備しなおすイメージ
	expandMainPreset([
		createLandBasePreset(),
		createFriendFleetPreset(),
		createEnemyFleetPreset(),
		document.getElementById('adapt_stage2')['checked'] ? selectedFormations : null,
		isDefMode,
		createAirRaidEnemyFleetPreset(),
		castInt($('#admin_lv').val())
	]);
}

/**
 * 基地空襲を起こす
 */
function btn_air_raid_Clicked() {

	// 誤操作があまりにもひどいので補給挟んでおく
	$('.lb_tab').each((i, e) => {
		$(e).find('.lb_plane').each((i, e2) => {
			if (castInt($(e2)[0].dataset.planeid) > 0) {
				$(e2).find('.slot').text(18);
			}
		});
	});
	// 搭載数のバリデーション
	createLandBaseInstance();
	$('.lb_tab').each((i, e) => {
		let isOk = false;
		let downCount = 4;
		$(e).find('.lb_plane').each((i, e2) => {
			if (!isOk && castInt($(e2)[0].dataset.planeid) > 0) {
				// 基地空襲を発生させる
				const currentSlot = castInt($(e2).find('.slot').text());
				// このスロットだけで受けきれる
				if (currentSlot > downCount) {
					$(e2).find('.slot').text(currentSlot - downCount);
					isOk = true;
				}
				else {
					// このスロットでは受けきれない場合、次のスロットに持ち越し
					$(e2).find('.slot').text(1);
					downCount -= (currentSlot - 1);
				}
			}
		});
	});

	calculate(true, false, false);
}

/**
 * 基地補給
 */
function btn_supply_Clicked() {
	$('.lb_tab').each((i, e) => {
		$(e).find('.lb_plane').each((i, e2) => {
			if (castInt($(e2)[0].dataset.planeid) > 0) {
				$(e2).find('.slot').text(18);
			}
		});
	});

	calculate(true, false, false);
}


/**
 * コンテンツキャプチャクリック
 * @param {JQuery} $this
 */
function btn_capture_Clicked($this) {
	const $targetContent = $this.closest('.contents');
	$targetContent.addClass('capturing');

	if (document.body.classList.contains('dark-theme')) {
		$targetContent.addClass('capture_dark');
		if (document.body.classList.contains('deep_blue_theme')) {
			$targetContent.addClass('capture_deep_blue');
		}
	}
	else $targetContent.addClass('capture_nomal');

	// 基地横並びに
	$targetContent.find('.lb_tab').removeClass('tab-pane fade');

	// レンダリングできなさそうなやつを置換 or 非表示
	const $no_captures = $targetContent.find('.no_capture:not(.d-none)');
	$no_captures.addClass('d-none');
	$targetContent.find('#admin_lv_capture').removeClass('d-none');
	$targetContent.find('#admin_lv').addClass('d-none');
	$targetContent.find('.btn_remove_plane').addClass('btn_remove_plane_capture');
	$targetContent.find('.r_btn').addClass('d-none');
	$targetContent.find('.d-lg-flex').addClass('d-none_lg').removeClass('d-lg-flex');
	$targetContent.find('.custom-checkbox').addClass('d-none');
	$targetContent.find('.battle_only').removeClass('ml-auto').addClass('ml-2');
	$targetContent.find('.plane_name_span').each((i, e) => {
		if ($(e).text() === '装備を選択') $(e).text('-');
		if ($(e).text() === '補強増設') $(e).text('-');
	});
	// 補強増設未装備なら非表示で
	$targetContent.find('.expanded_slot').each((i, e) => {
		if (castInt($(e)[0].dataset.planeid) <= 0) {
			$(e).addClass('d-none');
		}
	});

	// レンダリングズレ修正
	$targetContent.find('.custom-select').addClass('pt-0');
	$targetContent.find('.custom-select option').addClass('d-none');
	$targetContent.find('.form-control').addClass('pt-0');
	$targetContent.find('.general_box').addClass('general_box_capture');

	const prevY = window.pageYOffset;

	html2canvas($targetContent[0], {
		onrendered: function (canvas) {
			const imgData = canvas.toDataURL();

			// クリップボードコピー
			if ($('#clipboard_mode').prop('checked') && typeof ClipboardItem === "function") {
				try {
					canvas.toBlob(blob => {
						navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
					});
				} catch (error) {
					downloadImage(imgData);
				}
			}
			else {
				downloadImage(imgData);
			}

			// 戻す
			$targetContent.removeClass('capture_nomal capture_dark capture_deep_blue');
			$targetContent.find('.custom-checkbox').removeClass('d-none');
			$targetContent.find('.r_btn:not(.btn_commit_trade)').removeClass('d-none');
			$targetContent.find('.d-none_lg').addClass('d-none d-lg-flex').removeClass('d-none_lg');
			$targetContent.find('.btn_remove_plane').removeClass('btn_remove_plane_capture');
			$targetContent.find('.battle_only').addClass('ml-auto').removeClass('ml-2');
			$targetContent.find('.plane_name_span').each((i, e) => {
				if ($(e).text() === '-' && $(e).closest('.ship_plane').hasClass('expanded_slot')) $(e).text('補強増設');
				if ($(e).text() === '-') $(e).text('装備を選択');
			});
			$targetContent.find('.expanded_slot').removeClass('d-none');
			$no_captures.removeClass('d-none');

			$targetContent.find('.custom-select').removeClass('pt-0');
			$targetContent.find('.custom-select option').removeClass('d-none');
			$targetContent.find('.form-control').removeClass('pt-0');
			$targetContent.find('.general_box').removeClass('general_box_capture');

			$targetContent.find('#admin_lv_capture').addClass('d-none');
			$targetContent.find('#admin_lv').removeClass('d-none');

			$targetContent.removeClass('capturing');
			if ($('#lb_tab_select').css('display') !== 'none' && !$('#lb_item1').attr('class').includes('tab-pane')) {
				$('.lb_tab').addClass('tab-pane fade');
				$('.lb_tab:first').tab('show');
			}
			window.scrollTo(0, prevY);
		}
	});
}

/**
 * 保存処理
 * @param {*} data
 */
function downloadImage(data) {
	const fname = 'screenshot_' + formatDate(new Date(), 'yyyyMMdd_HHmmss') + '.jpg';

	if (window.navigator.msSaveBlob) {
		const encodeData = atob(data.replace(/^.*,/, ''));
		const outData = new Uint8Array(encodeData.length);
		for (let i = 0; i < encodeData.length; i++) {
			outData[i] = encodeData.charCodeAt(i);
		}
		const blob = new Blob([outData], ["image/png"]);
		window.navigator.msSaveOrOpenBlob(blob, fname);
	} else {
		const a = document.getElementById("getImage");
		a.href = data;
		a.download = fname;
		a.click();
	}
}

/**
 * コンテンツ一括解除クリック
 * @param {JQuery} $this
 */
function btn_reset_content_Clicked($this) {
	const parentId = $this.closest('.contents').attr('id');
	switch (parentId) {
		case 'landBase':
			$('.lb_plane').each((i, e) => setLBPlaneDiv($(e)));
			break;
		case 'friendFleet':
			clearShipDivAll();
			break;
		case 'enemyFleet':
			clearEnemyDivAll();
			break;
		default:
			break;
	}
	calculate();
}

/**
 * 全艦載機解除クリック
 * @param {JQuery} $this
 */
function btn_remove_plane_all_Clicked($this) {
	const $targetContent = $('#' + $('#modal_collectively_setting').data('target'));
	clearPlaneDivAll($targetContent);
}

/**
 * 全艦娘解除クリック
 */
function btn_remove_ship_all_Clicked() {
	clearShipDivAll();
	$('#modal_collectively_setting').modal('hide');
}

/**
 * 搭載数最大クリック
 * @param {JQuery} $this
 */
function btn_slot_max_Clicked($this) {
	const $targetContent = $('#' + $('#modal_collectively_setting').data('target'));
	if ($targetContent.attr('id') === 'landBase') {
		$('.coll_slot_range').val(18);
	}
	else if ($targetContent.attr('id') === 'friendFleet') {
		$('.coll_slot_range').val(99);
	}

	coll_slot_range_Changed($('.coll_slot_range'));
}

/**
 * 搭載数初期値クリック
 * @param {JQuery} $this
 */
function btn_slot_default_Clicked($this) {
	const $targetContent = $('#' + $('#modal_collectively_setting').data('target'));
	if ($targetContent.attr('id') === 'friendFleet') {
		$targetContent.find('.ship_plane').each((i, e) => {
			$(e).find('.slot').text($(e).find('.slot_select_parent').data('ini'));
		});
	}
}

/**
 * 搭載数最小クリック
 */
function btn_slot_min_Clicked() {
	$('.coll_slot_range').val(0);
	coll_slot_range_Changed($('.coll_slot_range'));
}

/**
 * 一括変更搭載数レンジ変更
 * @param {JQuery} $this
 */
function coll_slot_range_Changed($this) {
	const $targetContent = $('#' + $('#modal_collectively_setting').data('target'));
	let value = castInt($this.val());
	value = value > castInt($this.attr('max')) ? castInt($this.attr('max')) : value;
	if ($targetContent.attr('id') === 'landBase') {
		$targetContent.find('.lb_plane').each((i, e) => $(e).find('.slot').text(value));
	}
	else if ($targetContent.attr('id') === 'friendFleet') {
		$targetContent.find('.ship_plane').each((i, e) => $(e).find('.slot').text(value));
	}

	$('.coll_slot_input').val(value);
}

/**
 * 一括変更搭載数直接変更
 * @param {JQuery} $this
 */
function coll_slot_input_Changed($this) {
	// 入力検証 -> 数値 かつ 0 以上 max 以下　違ってたら修正
	let value = validateInputNumber($this.val(), castInt($('.coll_slot_range').attr('max')));

	$this.val(value);
	$('.coll_slot_range').val(value);
	coll_slot_range_Changed($('.coll_slot_range'));
}

/**
 * 一括改修値変更クリック
 * @param {JQuery} $this
 */
function btn_remodel_Clicked($this) {
	const $targetContent = $('#' + $('#modal_collectively_setting').data('target'));
	const remodel = castInt($this[0].dataset.remodel);
	if ($targetContent.attr('id') === 'landBase') {
		$targetContent.find('.lb_plane').each((i, e) => $(e).find('.remodel_select:not(.remodel_disabled)').find('.remodel_value').text(remodel));
	}
	else if ($targetContent.attr('id') === 'friendFleet') {
		$targetContent.find('.ship_plane').each((i, e) => $(e).find('.remodel_select:not(.remodel_disabled)').find('.remodel_value').text(remodel));
	}
}

/**
 * 戦闘機のみ熟練度最大クリック
 */
function btn_fighter_prof_max_Clicked() {
	const $targetContent = $('#' + $('#modal_collectively_setting').data('target'));
	if ($targetContent.attr('id') === 'landBase') {
		$targetContent.find('.lb_plane').each((i, e) => {
			if (FIGHTERS.includes(castInt($(e)[0].dataset.type2))) {
				setProficiency($(e).find('.prof_select'), 7);
			}
		});
	}
	else if ($targetContent.attr('id') === 'friendFleet') {
		$targetContent.find('.ship_plane').each((i, e) => {
			if (FIGHTERS.includes(castInt($(e)[0].dataset.type))) {
				setProficiency($(e).find('.prof_select'), 7);
			}
		});
	}
}

/**
 * 熟練度ボタンクリック
 * @param {JQuery} $this
 */
function btn_prof_Clicked($this) {
	const $targetContent = $('#' + $('#modal_collectively_setting').data('target'));
	const prof = $this[0].dataset.prof;
	if ($targetContent.attr('id') === 'landBase') {
		$targetContent.find('.lb_plane').each((i, e) => {
			// 陸偵は||まで
			if (prof > 2 && castInt($(e)[0].dataset.planeid) === 312) setProficiency($(e).find('.prof_select'), 2);
			else if (castInt($(e)[0].dataset.planeid) !== 311) setProficiency($(e).find('.prof_select'), prof);
		});
	}
	else if ($targetContent.attr('id') === 'friendFleet') {
		$targetContent.find('.ship_plane').each((i, e) => {
			setProficiency($(e).find('.prof_select'), prof);
		});
	}
}

function plane_lock_Clicked($this) {
	if ($this.length) {
		$this.addClass('d-none');
		// $this.closest('.ship_plane').find('.plane_unlock').removeClass('d-none');
	}
}

function plane_unlock_Clicked($this) {
	if ($this.length) {
		$this.addClass('d-none');
		// $this.closest('.ship_plane').find('.plane_lock').removeClass('d-none');
	}
}

/**
 * 改修値メニュー展開時 初回展開時メニュー生成
 * @param {JQuery} $this
 */
function remodelSelect_Shown($this) {
	if (!$this.find('.dropdown-menu').html().trim()) {
		let menuText = '';
		for (let i = 0; i < 10; i++) {
			menuText += `<div class="remodel_item text_remodel" data-remodel="${i}"><i class="fas fa-star"></i>+${i}</div>`;
		}
		menuText += '<div class="remodel_item text_remodel" data-remodel="10"><i class="fas fa-star"></i>max</div>';
		$this.find('.dropdown-menu').append(menuText);
	}
	else $this.find('.remodel_item_selected').removeClass('remodel_item_selected');
}

/**
 * 改修値変更時
 * @param {JQuery} $this
 */
function remodelSelect_Changed($this) {
	if ($this.find('.remodel_item_selected').length) {
		const remodel = Math.min(castInt($this.find('.remodel_item_selected').data('remodel')), 10);
		$this.removeClass('remodel_item_selected');
		$this.find('.remodel_value').text(remodel);
		if (remodel) {
			$this.find('.remodel_select').removeClass('zero');
		}
		else {
			$this.find('.remodel_select').addClass('zero');
		}
		calculate(true, true, false);
	}
}

/**
 * 熟練度メニュー展開時 初回展開時メニュー生成
 * @param {JQuery} $this
 */
function profSelect_Shown($this) {
	if (!$this.find('.dropdown-menu').html().trim()) {
		let menuText = '';
		for (let i = 7; i >= 0; i--) {
			menuText += `<a class="dropdown-item prof_item"><img class="prof_opt" alt="${getProfString(i)}" data-prof="${i}" src="../img/util/prof${i}.png"></a>`;
		}
		$this.find('.dropdown-menu').append(menuText);
	}
}

/**
 * 熟練度変更時
 * @param {JQuery} $this .prof_item
 * @param {boolean} cancelCalculate 計算を起こさせない場合true 未指定時 false
 */
function proficiency_Changed($this, cancelCalculate = false) {
	const $orig = $this.find('.prof_opt');
	if (!$orig.length) {
		return;
	}
	const $targetSelect = $this.parent().prev();
	const prof = $orig[0].dataset.prof;
	$targetSelect.attr('src', $orig.attr('src')).attr('alt', $orig.attr('alt'));
	$targetSelect[0].dataset.prof = prof;

	if (!cancelCalculate) calculate(true, true, false);
}

/**
 * 熟練度変更
 * @param {JQuery} $targetSelect 適用先.prof_select
 * @param {number} prof 適用する値
 */
function setProficiency($targetSelect, prof) {
	$targetSelect.attr('src', `../img/util/prof${prof}.png`).attr('alt', getProfString(prof));
	$targetSelect[0].dataset.prof = prof;
}

/**
 * 初期熟練度変更時
 * @param {JQuery} $this
 */
function init_proficiency_Changed($this) {
	proficiency_Changed($this, true);

	// localStorage更新
	const prof = castInt($this.find('.prof_opt')[0].dataset.prof);
	const tmp = setting.defaultProf.find(v => v.id === castInt($this.closest('.init_prof')[0].dataset.typeid));
	if (!tmp) {
		// ないカテゴリなら追加
		setting.defaultProf.push({ id: castInt($this.closest('.init_prof')[0].dataset.typeid), prof: prof });
	}
	else {
		tmp.prof = prof;
	}
	saveSetting();
}

/**
 * 搭載数調整欄展開時
 * @param {JQuery} $this
 */
function slot_select_parent_Show($this) {

	// 初回起動時メニュー生成
	if (!$this.find('.dropdown-menu').html().trim()) {
		$this.find('.dropdown-menu').append(`
		<span class="dropdown-header py-1 px-1 font_size_12">搭載数を入力</span>
			<div class="d-flex mb-2 justify-content-between">
				<div class="align-self-center flex-grow-1">
					<input type="number" class="form-control form-control-sm slot_input" value="0" min="0" max="99">
				</div>
				<div class="ml-1 align-self-center">
					<button type="button" data-ini="0" class="btn btn-sm btn-primary slot_ini">
						<span class="text-nowrap">初期値</span>
					</button>
				</div>
			</div>
			<input type="range" class="custom-range slot_range" value="0" min="0" max="99">
		`);
	}

	const preSlot = castInt($this.find('.slot').text());
	$this.find('.slot_input').val(preSlot);
	$this.find('.slot_range').val(preSlot);
}

/**
 * 搭載数調整欄 レンジバー変更時
 * @param {JQuery} $this
 */
function slot_range_Changed($this) {
	const $slotArea = $this.closest('.slot_select_parent');
	$slotArea.find('.slot').text($this.val());
	$slotArea.find('.slot_input').val($this.val());
}

/**
 * 搭載数調整欄 搭載数入力欄変更時
 * @param {JQuery} $this
 */
function slot_input_Changed($this) {
	// 入力検証 -> 数値 かつ 0 以上 max 以下　違ってたら修正
	const value = validateInputNumber($this.val(), castInt($this.attr('max')));

	$this.val(value);
	$this.closest('.slot_select_parent').find('.slot').text(value);
	$this.next().val(value);
}

/**
 * 搭載数調整欄 初期ボタンクリック
 * @param {JQuery} $this
 */
function slot_ini_Clicked($this) {
	const $slotArea = $this.closest('.slot_select_parent');
	const defaultValue = $slotArea.data('ini');
	$slotArea.find('.slot').text(defaultValue);
	$slotArea.find('.slot_input').val(defaultValue);
	$slotArea.find('.slot_range').val(defaultValue);
}

/**
 * 搭載数調整欄終了時
 * @param {JQuery} $this
 */
function slot_select_parent_Close($this) {
	let inputSlot = castInt($this.find('.slot_input').val());
	let maxSlot = castInt($this.find('.slot_input').attr('max'));
	$this.find('.slot').text(inputSlot > maxSlot ? maxSlot : inputSlot);
	calculate(true, true, false);
}

/**
 * 練度選択
 * @param {JQuery} $this
 */
function ship_level_input_Changed($this) {
	// 入力検証 -> 数値 かつ 0 以上 max 以下　違ってたら修正
	const value = validateInputNumber($this.val(), castInt($this.attr('max')));
	$this.val(value);
	$target.text(value ? value : 1);
	$this.next().val(value);
}

/**
 * 練度選択 レンジバー変更時
 * @param {JQuery} $this
 */
function ship_level_range_Changed($this) {
	const $area = $('#modal_level_input');
	const level = castInt($this.val());
	$area.find('.ship_level_input').val(level);
	$target.text(level);
}

/**
 * 練度選択 レベルボタンクリック時
 * @param {JQuery} $this
 */
function level_Clicked($this) {
	const level = castInt($this[0].dataset.level);
	const $area = $('#modal_level_input');
	$area.find('.ship_level_input').val(level);
	$area.find('.ship_level_range').val(level);
	$target.text(level);
}

/**
 * 運変更
 * @param {JQuery} $this
 */
function ship_luck_input_Changed($this) {
	// 入力検証 -> 数値 かつ 0 以上 max 以下　違ってたら修正
	const value = validateInputNumber($this.val(), castInt($this.attr('max')));
	$this.val(value);
	const min = castInt($this.attr('min'))
	$target.text(value ? (value >= min ? value : min) : min);
	$this.next().val(value);
}

/**
 * 運変更 レンジバー変更時
 * @param {JQuery} $this
 */
function ship_luck_range_Changed($this) {
	const $area = $('#modal_luck_input');
	const level = castInt($this.val());
	$area.find('.ship_luck_input').val(level);
	$target.text(level);
}

/**
 * 乗せられた位置に装備ツールチップ展開
 * @param {JQuery} $this
 * @param {boolean} isLandBase 基地かどうか 基本はfalse
 */
function showItemToolTip($this, isLandBase = false) {
	const $parent = $this.closest(isLandBase ? '.lb_plane' : '.ship_plane');
	let shipId = 0;
	if (!$parent.length || !$parent[0].dataset.planeid || $parent.hasClass('ui-draggable-dragging')) return;
	else if ($parent.closest('.ship_tab').length) {
		shipId = castInt($parent.closest('.ship_tab')[0].dataset.shipid);
	}

	// 機体情報オブジェクト取得
	const id = castInt($parent[0].dataset.planeid);
	const slot = castInt($parent[0].getElementsByClassName('slot')[0].textContent);
	const remodel = castInt($parent[0].getElementsByClassName('remodel_value')[0].textContent);
	const level = castInt($parent[0].getElementsByClassName('prof_select')[0].dataset.prof);

	const text = getItemTooltipContext(id, $parent[0].classList.contains('lb_plane'), slot, remodel, level, shipId);

	showTooltip($this[0], text, 'right');
}

/**
 * 装備一覧用ツールチップ展開 搭載数の概念はない
 * @param {JQuery} $this
 */
function showPlaneBasicToolTip($this) {
	let remodel = 0;
	if ($this.find('.plane_td_remodel').length) {
		remodel = castInt($this.find('.plane_td_remodel')[0].dataset.remodel);
	}

	let shipId = 0;
	// いま開いている装備一覧の親が基地？
	const isLandBase = $target && !$target.hasClass('ship_plane');
	if ($target && $target.closest('.ship_tab').length) {
		shipId = castInt($target.closest('.ship_tab')[0].dataset.shipid);
	}
	const text = getItemTooltipContext(castInt($this[0].dataset.planeid), isLandBase, 0, remodel, 0, shipId);

	showTooltip($this[0], text, 'bottom', 'window');
}

/**
 * 引数の情報から、装備ツールチップのHTMLテキストを生成
 * @param {number} itemId 装備id
 * @param {boolean} [isLandBase=false] 基地モード
 * @param {number} [slot=0] 搭載数
 * @param {number} [remodel=0] 改修値
 * @param {number} [level=0] 熟練度
 * @param {number} [ship=null] 艦娘データ あれば
 * @returns {string} 装備ツールチップのHTMLテキスト
 */
function getItemTooltipContext(itemId, isLandBase = false, slot = 0, remodel = 0, level = 0, shipId = 0) {
	/** @type {Item}} */
	let item = null;
	if (isLandBase) {
		item = new LandBaseItem(itemId, slot, remodel, level);
	}
	else {
		item = new ShipItem(itemId, slot, remodel, level);
	}
	// ありえないが、存在しなければ返却
	if (!item.id) return "";

	// 基礎ステータス用にマスタからデータを取得
	const raw = ITEM_DATA.find(v => v.id === item.id);
	const type = raw.type;
	// 改修値によるボーナスの設定
	const bAntiAir = item.bonusAntiAir;
	const bFire = Item.getBonusFire(type, remodel);
	const bScout = Item.getBonusScout(type, remodel);
	let bTorpedo = Item.getBonusTorpedo(type, remodel);
	if (shipId) {
		const shipRaw = SHIP_DATA.find(v => v.id === shipId);
		if (shipRaw) {
			const ship = new Ship();
			ship.id = shipRaw.id;
			ship.name = shipRaw.name;
			ship.type = shipRaw.type;
			ship.type2 = shipRaw.type2;
			bTorpedo += ShipItem.getAttackerBonus(item, ship);
		}
	}
	const bAccuracy = Item.getBonusAccuracy(itemId, type, remodel);
	const bBomber = Item.getBonusBomber(itemId, type, remodel);
	const bASW = Item.getBonusASW(itemId, type, remodel, raw.antiAir);
	const rangeObj = RANGES.find(v => v.id === raw.range2);
	const rangeText = raw.range2 && rangeObj ? rangeObj.name : '';

	// 各種描画部品 設定がなければ描画されない
	const remodelText = remodel ? `<span class="text_remodel">★${remodel}</span>` : '';
	const bAntiAirText = bAntiAir ? `<span class="ml-1 text_remodel">(+${bAntiAir.toFixed(2)})</span>` : '';
	const bFireText = bFire ? `<span class="ml-1 text_remodel">(+${bFire.toFixed(2)})</span>` : '';
	const bTorpedoText = bTorpedo ? `<span class="ml-1 text_remodel">(+${bTorpedo.toFixed(2)})</span>` : '';
	const bBomberText = bBomber ? `<span class="ml-1 text_remodel">(+${bBomber.toFixed(2)})</span>` : '';
	const bAccuracyText = bAccuracy ? `<span class="ml-1 text_remodel">(+${bAccuracy.toFixed(2)})</span>` : '';
	const bASWText = bASW ? `<span class="ml-1 text_remodel">(+${bASW.toFixed(2)})</span>` : '';
	const bScoutText = bScout ? `<span class="ml-1 text_remodel">(+${bScout.toFixed(2)})</span>` : '';
	const avoid = raw.avoid > 0 ? AVOID_TYPE.find(v => v.id === raw.avoid) : null;
	const selectRate = item.selectRate.length ? item.selectRate.map(v => (100 * v).toFixed(0) + '%') : null;
	const growing = PLANE_TYPE.includes(raw.type) ? getRequiredgBattleCountString(raw.grow) : null;

	const text = `
	<div class="text-left m-1 item_tooltip">
		<div class="d-flex">
			<img src="../img/type/icon${raw.itype}.png" alt="${raw.itype}" class="img-size-36 align-self-center">
			<div class="ml-1 align-self-center">
				<div class="font_size_12">id: ${raw.id}</div>
				<div><span>${raw.name}</span>${remodelText}</div>
			</div>
		</div>
		<div class="d-flex flex-wrap my-1">
			${item.slot ? `<div class="mr-3">制空値: ${item.airPower}</div>` : ''}
			${item.defenseAirPower && item.airPower !== item.defenseAirPower ? `<div>防空時: ${item.defenseAirPower}</div>` : ''}
		</div>
		<div class="font_size_12 d-flex flex-wrap item_status_box">
			${(raw.antiAir + bAntiAir) ? `<div class="col_half"><span>対空: ${raw.antiAir}</span>${bAntiAirText}</div>` : ''}
			${(raw.fire + bFire) ? `<div class="col_half"><span>火力: ${raw.fire}</span>${bFireText}</div>` : ''}
			${(raw.torpedo + bTorpedo) ? `<div class="col_half"><span>雷装: ${raw.torpedo}</span>${bTorpedoText}</div>` : ''}
			${(raw.bomber + bBomber) ? `<div class="col_half"><span>爆装: ${raw.bomber}</span>${bBomberText}</div>` : ''}
			${(raw.accuracy + bAccuracy) ? `<div class="col_half"><span>命中: ${raw.accuracy}</span>${bAccuracyText}</div>` : ''}
			${(raw.asw + bASW) ? `<div class="col_half"><span>対潜: ${raw.asw}</span>${bASWText}</div>` : ''}
			${(raw.scout + bScout) ? `<div class="col_half"><span>索敵: ${raw.scout}</span>${bScoutText}</div>` : ''}
			${raw.armor ? `<div class="col_half">装甲: ${raw.armor}</div>` : ''}
			${raw.avoid2 ? `<div class="col_half">回避: ${raw.avoid2}</div>` : ''}
			${raw.antiBomber ? `<div class="col_half">対爆: ${raw.antiBomber}</div>` : ''}
			${raw.interception ? `<div class="col_half">迎撃: ${raw.interception}</div>` : ''}
			${raw.radius ? `<div class="col_half">半径: ${raw.radius}</div>` : ''}
			${rangeText ? `<div class="col_half">射程: ${rangeText}</div>` : ''}
			${TAICHI.includes(itemId) ? `<div class="col_half">対地: 可</div>` : ''}
		</div>
		${avoid ? `<div class="font_size_12">射撃回避: ${avoid.name} ( 加重対空: ${avoid.adj[0]} 艦隊防空: ${avoid.adj[1].toFixed(1)} )</div>` : ''}
		${item.antiAirWeight ? `<div class="font_size_12">加重対空: ${item.antiAirWeight.toFixed(2)}</div>` : ''}
		${item.antiAirBonus ? `<div class="font_size_12">艦隊防空: ${item.antiAirBonus.toFixed(2)}</div>` : ''}
		${item.isJet && item.slot ? `<div class="font_size_12">鋼材消費 (噴式強襲発生時): ${Math.round(item.slot * item.cost * 0.2)}` : ''}
		${selectRate && selectRate.length ? `<div class="font_size_12">触接選択率(確保時): ${selectRate[0]}</div>` : ''}
		${growing ? `<div class="font_size_12">熟練度<img class="img-size-18_lock" alt=">>" src="../img/util/prof7.png">まで: ${growing}</div>` : ''}
	</div>`;

	return text.trim();
}

/**
 * 乗せられた位置に敵艦情報ツールチップ展開
 * @param {JQuery} $this
 */
function showEnemyStatusToolTip($this) {
	if (!$this.length || !$this[0].dataset.enemyid) return;

	// 敵情報オブジェクト取得
	const enm = ENEMY_DATA.find(v => v.id === castInt($this[0].dataset.enemyid));

	if (!enm) return;
	const enemy = new Enemy(enm.id);

	let itemText = '';
	let sumArmor = 0;
	for (let i = 0; i < enm.eqp.length; i++) {
		const itemId = enm.eqp[i];
		const slot = enm.slot[i];
		const item = ENEMY_ITEM.find(v => v.id === itemId);
		if (!item) continue;

		sumArmor += item.armor;
		itemText += `
			<div class="d-flex">
				<div class="align-self-center enemy_tool_slot">${slot > 0 ? slot : 0}</div>
				<div class="ml-1 align-self-center">
					<img src="../img/type/icon${item.itype}.png" alt="${item.itype}" class="img-size-30">
				</div>
				<div class="ml-1 align-self-center">
					<span class="font_size_11">id: ${item.id}</span>
					<span> ${item.name}</span>
				</div>
			</div>`;
	}

	let text =
		`<div class="text-left m-1">
			<div class="d-flex">
				<div class="align-self-center font_size_11">ID: ${1500 + enm.id}</div>
				<div class="ml-2 align-self-center">${enm.name}</div>
			</div>
			<div class="d-flex mt-1">
				<div>HP: ${enemy.hp}</div>
				<div class="ml-3">装甲: ${enemy.armor + sumArmor}（${enemy.armor}）</div>
			</div>
			<div class="d-flex mt-1">
				${enemy.airPower ? `<div>制空値: ${enemy.airPower}</div>` : ''}
				${!enemy.airPower && enemy.landBaseAirPower ? `<div>基地制空値: ${enemy.landBaseAirPower}</div>` : ''}
			</div>
			<div class="mt-1">
				${itemText}
			</div>
		</div>`;

	showTooltip($this[0], text);
}

/**
 * 乗せられた位置に敵機体ツールチップ展開
 * @param {JQuery} $this
 */
function showEnemyPlaneToolTip($this) {
	if (!$this.length || !$this[0].dataset.planeid) return;

	// 機体情報オブジェクト取得
	const plane = ENEMY_ITEM.find(v => v.id === castInt($this[0].dataset.planeid));

	if (!plane) return;
	const text =
		`<div class="text-left">
			<div>
				<img src="../img/type/icon${plane.itype}.png" alt="${plane.itype}" class="img-size-25">
				<span>${plane.name}</span>
			</div>
			<div class="font_size_12 d-flex flex-wrap item_status_box">
				${plane.antiAir ? `<div class="col_half">対空: ${plane.antiAir}</div>` : ''}
				${plane.fire ? `<div class="col_half">火力: ${plane.fire}</div>` : ''}
				${plane.torpedo ? `<div class="col_half">雷装: ${plane.torpedo}</div>` : ''}
				${plane.bomber ? `<div class="col_half">爆装: ${plane.bomber}</div>` : ''}
				${plane.asw ? `<div class="col_half">対潜: ${plane.asw}</div>` : ''}
				${plane.armor ? `<div class="col_half">装甲: ${plane.armor}</div>` : ''}
				${plane.scout ? `<div class="col_half">索敵: ${plane.scout}</div>` : ''}
				${plane.accuracy ? `<div class="col_half">命中: ${plane.accuracy}</div>` : ''}
				${plane.avoid2 ? `<div class="col_half">回避: ${plane.avoid2}</div>` : ''}
			</div>
		</div>`;
	showTooltip($this[0], text);
}

/**
 * 触接詳細制空ラジオ変更
 */
function contact_detail_redraw() {
	const index = castInt($('#modal_contact_detail').data('dispIndex'));
	if (index > -1) btn_show_contact_rate_lb_Clicked(null, index);
	else btn_show_contact_rate_Clicked();
}

/**
 * 触接詳細ボタンクリック基地
 * @param {JQuery} $this
 */
function btn_show_contact_rate_lb_Clicked($this, no = 0) {
	const lbNo = !$this ? no : castInt($this[0].dataset.lb) - 1;
	const landBase = createLandBaseInstance();

	const contactTable = createContactTable(landBase.landBases[lbNo].planes);
	const $nomal = document.getElementById('nomal_contact_table');
	document.getElementsByClassName('detail_contact_chart_parent')[0].classList.add('w-75');
	document.getElementsByClassName('detail_contact_chart_parent')[1].classList.add('d-none');
	document.getElementById('grand_contact_table').classList.add('d-none');
	document.getElementById('land_base_contact_tips').classList.remove('d-none');

	for (let i = 0; i < 3; i++) {
		const $tr = $nomal.getElementsByClassName('contact_status_' + i)[0];
		$tr.getElementsByClassName('td_start_contact_rate')[0].textContent = contactTable[i][0].toFixed(1) + '%';
		$tr.getElementsByClassName('td_120_contact_rate')[0].textContent = contactTable[i][1].toFixed(1) + '%';
		$tr.getElementsByClassName('td_117_contact_rate')[0].textContent = contactTable[i][2].toFixed(1) + '%';
		$tr.getElementsByClassName('td_112_contact_rate')[0].textContent = contactTable[i][3].toFixed(1) + '%';
		$tr.getElementsByClassName('td_sum_contact_rate')[0].textContent = contactTable[i][4].toFixed(1) + '%';
	}

	// グラフ表示
	const index = $('#contact_detail_0').prop('checked') ? 0 : $('#contact_detail_1').prop('checked') ? 1 : 2;
	const nomarlData = [contactTable[index][1], contactTable[index][2], contactTable[index][3], 100 - contactTable[index][4]];
	const chartLabels = ["120%触接", "117%触接", "112%触接", "不発"];
	const chartColors = ["rgb(100, 180, 255, 0.7)", "rgba(80, 220, 120, 0.7)", "rgba(255, 160, 100, 0.7)", "rgba(128, 128, 128, 0.5)"];
	const ctx = document.getElementById("detail_contact_chart");
	const borderColor = mainColor === '#000000' ? '#fff' : '#333';
	const titleColor = `rgba(${hexToRGB(mainColor).join(',')}, 0.8)`;
	// グラフ中央のアレ
	document.getElementById('detail_contact_rate_sum').textContent = contactTable[index][4].toFixed(1);

	if (!chartInstance) {
		chartInstance = new Chart(ctx, {
			type: 'doughnut',
			data: {
				labels: chartLabels,
				datasets: [{ backgroundColor: chartColors, data: nomarlData, borderColor: borderColor }]
			},
			plugins: [ChartDataLabels],
			options: {
				legend: { display: false },
				title: { display: true, text: `第${lbNo + 1}基地航空隊 触接率`, fontColor: titleColor },
				tooltips: { callbacks: { label: function (i, d) { return `${d.labels[i.index]}: ${d.datasets[0].data[i.index].toFixed(1)} %`; } } },
				plugins: { datalabels: { color: mainColor, formatter: function (v, c) { return v > 0 ? v.toFixed(1) + '%' : ''; } } }
			}
		});
	}
	else {
		chartInstance.data.datasets[0].data = nomarlData;
		chartInstance.update();
	}

	$('#modal_contact_detail').data('dispIndex', lbNo);
	$('#modal_contact_detail').modal('show');
}

/**
 * 触接詳細ボタンクリック
 */
function btn_show_contact_rate_Clicked() {
	const fleet = createFleetInstance();

	let planes = [];
	let unionPlanes = [];
	for (const ship of fleet.ships) {
		for (const item of ship.items) {
			if (item.id === 0) {
				continue;
			}

			unionPlanes.push(item);
			if (!ship.isEscort) {
				planes.push(item);
			}
		}
	}

	const nomalContact = createContactTable(planes);
	const grandContact = createContactTable(unionPlanes);

	const $nomal = document.getElementById('nomal_contact_table');
	const $grand = document.getElementById('grand_contact_table');
	document.getElementsByClassName('detail_contact_chart_parent')[0].classList.remove('w-75');
	document.getElementsByClassName('detail_contact_chart_parent')[1].classList.remove('d-none');
	document.getElementById('grand_contact_table').classList.remove('d-none');
	document.getElementById('land_base_contact_tips').classList.add('d-none');

	for (let i = 0; i < 3; i++) {
		const $tr = $nomal.getElementsByClassName('contact_status_' + i)[0];
		$tr.getElementsByClassName('td_start_contact_rate')[0].textContent = nomalContact[i][0].toFixed(1) + '%';
		$tr.getElementsByClassName('td_120_contact_rate')[0].textContent = nomalContact[i][1].toFixed(1) + '%';
		$tr.getElementsByClassName('td_117_contact_rate')[0].textContent = nomalContact[i][2].toFixed(1) + '%';
		$tr.getElementsByClassName('td_112_contact_rate')[0].textContent = nomalContact[i][3].toFixed(1) + '%';
		$tr.getElementsByClassName('td_sum_contact_rate')[0].textContent = nomalContact[i][4].toFixed(1) + '%';
	}

	for (let i = 0; i < 3; i++) {
		const $tr = $grand.getElementsByClassName('contact_status_' + i)[0];
		$tr.getElementsByClassName('td_start_contact_rate')[0].textContent = grandContact[i][0].toFixed(1) + '%';
		$tr.getElementsByClassName('td_120_contact_rate')[0].textContent = grandContact[i][1].toFixed(1) + '%';
		$tr.getElementsByClassName('td_117_contact_rate')[0].textContent = grandContact[i][2].toFixed(1) + '%';
		$tr.getElementsByClassName('td_112_contact_rate')[0].textContent = grandContact[i][3].toFixed(1) + '%';
		$tr.getElementsByClassName('td_sum_contact_rate')[0].textContent = grandContact[i][4].toFixed(1) + '%';
	}

	// グラフ表示
	const index = $('#contact_detail_0').prop('checked') ? 0 : $('#contact_detail_1').prop('checked') ? 1 : 2;
	const nomarlData = [nomalContact[index][1], nomalContact[index][2], nomalContact[index][3], 100 - nomalContact[index][4]];
	const grandData = [grandContact[index][1], grandContact[index][2], grandContact[index][3], 100 - grandContact[index][4]];
	const chartLabels = ["120%触接", "117%触接", "112%触接", "不発"];
	const chartColors = ["rgb(100, 180, 255, 0.7)", "rgba(80, 220, 120, 0.7)", "rgba(255, 160, 100, 0.7)", "rgba(128, 128, 128, 0.5)"];
	const ctx = document.getElementById("detail_contact_chart");
	const ctx2 = document.getElementById("detail_contact_chart_2");
	const borderColor = mainColor === '#000000' ? '#fff' : '#333';
	const titleColor = `rgba(${hexToRGB(mainColor).join(',')}, 0.8)`;
	// グラフ中央のアレ
	document.getElementById('detail_contact_rate_sum').textContent = nomalContact[index][4].toFixed(1);
	document.getElementById('detail_contact_rate_sum_2').textContent = grandContact[index][4].toFixed(1);

	if (!chartInstance) {
		chartInstance = new Chart(ctx, {
			type: 'doughnut',
			data: {
				labels: chartLabels,
				datasets: [{ backgroundColor: chartColors, data: nomarlData, borderColor: borderColor }]
			},
			plugins: [ChartDataLabels],
			options: {
				legend: { display: false },
				title: { display: true, text: '対敵通常艦隊', fontColor: titleColor },
				tooltips: { callbacks: { label: function (i, d) { return `${d.labels[i.index]}: ${d.datasets[0].data[i.index].toFixed(1)} %`; } } },
				plugins: { datalabels: { color: mainColor, formatter: function (v, c) { return v > 0 ? v.toFixed(1) + '%' : ''; } } }
			}
		});
	}
	else {
		chartInstance.data.datasets[0].data = nomarlData;
		chartInstance.update();
	}

	if (!subChartInstance) {
		subChartInstance = new Chart(ctx2, {
			type: 'doughnut',
			data: {
				labels: chartLabels,
				datasets: [{ backgroundColor: chartColors, data: grandData, borderColor: borderColor }]
			},
			plugins: [ChartDataLabels],
			options: {
				legend: { display: false },
				title: { display: true, text: '対敵連合艦隊', fontColor: titleColor },
				tooltips: { callbacks: { label: function (i, d) { return `${d.labels[i.index]}: ${d.datasets[0].data[i.index].toFixed(1)} %`; } } },
				plugins: { datalabels: { color: mainColor, formatter: function (v, c) { return v > 0 ? v.toFixed(1) + '%' : ''; } } }
			}
		});
	}
	else {
		subChartInstance.data.datasets[0].data = grandData;
		subChartInstance.update();
	}

	$('#modal_contact_detail').data('dispIndex', -1);
	$('#modal_contact_detail').modal('show');
}

/**
 * 対空砲火詳細欄展開
 */
function btn_antiair_input_Clicked() {
	// 対空CI一覧を初期化しておく
	document.getElementById('antiair_cutin_inputs').innerHTML = '';

	updateFleetStage2Table();
	$('#modal_fleet_antiair_input').modal('show');
}

/**
 * 練度変更
 * @param {JQuery} $this
 */
function form_ship_level_Clicked($this) {
	$target = $this.find('.ship_level');

	const $modal = $('#modal_level_input');
	const level = castInt($target.text());
	$modal.find('.ship_level_input').val(level);
	$modal.find('.ship_level_range').val(level);
	$modal.modal('show');
}

/**
 * 運変更
 * @param {JQuery} $this
 */
function form_ship_luck_Clicked($this) {
	$target = $this.find('.ship_luck');

	const shipId = castInt($this.closest('.ship_tab')[0].dataset.shipid);
	const ship = SHIP_DATA.find(v => v.id === shipId);
	const max = ship ? ship.max_luck : 99;
	const min = ship ? ship.luck : 99;
	const $modal = $('#modal_luck_input');
	const luck = castInt($target.text());

	const input = $modal.find('.ship_luck_input')
	input.val(luck);
	input.attr('max', max);
	input.attr('min', min);

	const range = $modal.find('.ship_luck_range');
	range.val(luck);
	range.attr('max', max);
	range.attr('min', min);

	$modal.modal('show');
}

/**
 * 司令部レベル変更時
 */
function admin_lv_Changed() {
	const $this = $('#admin_lv');
	// 入力検証 -> 数値 かつ 0 以上 max 以下　違ってたら修正
	const value = validateInputNumber($this.val(), castInt($this.attr('max')));
	$this.val(value);
	$('#admin_lv_capture').text(value);

	// 索敵のとこだけ修正
	const fleet = createFleetInstance();
	for (let i = 1; i <= 4; i++) {
		const fleetScout = document.getElementsByClassName('fleet_scout' + i)[0];
		const fleetScout2 = document.getElementsByClassName('fleet_scout' + i)[1];
		// 艦隊防空値
		fleetScout.textContent = fleet.scoutScores[i - 1];
		fleetScout2.textContent = fleet.scoutScores[i - 1];
	}
}

/**
 * 対空CI有効無効変更
 * @param {JQuery} $this
 */
function anti_air_cutin_toggle_Clicked($this) {
	if ($this.hasClass('disabled')) {
		$this.removeClass('disabled');
		$this.find('.fa-eye-slash').removeClass('fa-eye-slash').addClass('fa-eye');
	}
	else {
		$this.addClass('disabled');
		$this.find('.fa-eye').addClass('fa-eye-slash').removeClass('fa-eye');
	}

	updateFleetStage2Table();
}

/**
 * 自艦隊対空性能の計算 モーダル内
 */
function updateFleetStage2Table() {
	// 入力情報ベースに味方艦隊対空基本性能を初期化
	const fleet = createFleetInstance();
	// 陣形 => これはモーダル内で選択されてる陣形を反映する
	const formationId = castInt($('#fleet_antiair_formation').val());
	// 空襲？
	const isAirRaid = $('#antiair_air_raid').prop('checked');
	fleet.updateStage2All(formationId, isAirRaid);

	// 連合に設定されてるなら空襲チェックボックスを出す
	if (fleet.isUnion) {
		$('#antiair_air_raid').parent().removeClass('d-none');
	}
	else {
		$('#antiair_air_raid').parent().addClass('d-none');
	}

	const antiairCutinInputs = document.getElementById('antiair_cutin_inputs');

	// 対空CI無効化設定　そもそも未生成なら全部有効
	const disabledCutin = [];
	for (const tr of antiairCutinInputs.getElementsByClassName('anti_air_cutin_toggle')) {
		if (tr.classList.contains('disabled')) {
			disabledCutin.push(castInt(tr.dataset.cutinid, -1));
		}
	}

	// 固定撃墜と最低保証の数 艦娘数の2次元配列で。
	const minimumValues = [];
	const fixValues = [];
	for (let i = 0; i < fleet.ships.length; i++) {
		// 初期の値
		minimumValues.push([]);
		fixValues.push([]);
	}

	// 各種対空CI発動時撃墜テーブルの固定、最低保証を格納していく
	for (const stage2 of fleet.allStage2) {
		// 無効化カットインの前には無力・・・
		if (disabledCutin.includes(stage2.cutin.id)) {
			continue;
		}

		for (let i = 0; i < stage2.table.length; i++) {
			const st = stage2.table[i];
			minimumValues[i].push(st.minimumDown);
			fixValues[i].push(st.fixDown);
		}
	}

	// 艦隊防空値の描画
	$('#fleet_antiair').text(fleet.antiAirBonus.toFixed(2));

	// 一覧の描画
	let text = '';
	const maxShipCount = getMaxShipCount();
	for (let i = 0; i < fleet.ships.length; i++) {
		const ship = fleet.ships[i];
		const shipIndex = ship.shipNo % maxShipCount;

		// 何も入っとらんやんけ
		if (!minimumValues[i].length || !fixValues[i].length) {
			// 不発データを突っ込んでおく
			fleet.updateStage2(formationId, 0, isAirRaid);
			minimumValues[i].push([ship.minimumDown]);
			fixValues[i].push([ship.fixDown]);
		}
		const minimumMax = getArrayMax(minimumValues[i]);
		const minimumMin = getArrayMin(minimumValues[i]);
		const fixMax = getArrayMax(fixValues[i]);
		const fixMin = getArrayMin(fixValues[i]);

		const minimumText = minimumValues[i].length >= 2 ? `${minimumMin} ~ ${minimumMax}` : minimumMax;
		const fixText = fixValues[i].length >= 2 ? `${fixMin} ~ ${fixMax}` : fixMax;

		text += `
		<tr class="${ship.isEscort ? 'escort_fleet' : 'main_fleet'}">
			<td class="text-left text-truncate">
				<span class="font_size_11 ${ship.isEscort ? 'text-primary' : 'text-success'}">${shipIndex > 0 ? shipIndex : maxShipCount}.</span>
				<span>${ship.name}</span>
			</td>
			<td class="rate_shoot_down">${Math.floor(ship.rateDown * 10000) / 100} %</td>
			<td class="fixed_shoot_down">${fixText}</td>
			<td class="minimum_shoot_down">${minimumText}</td>
		</tr>`;
	}
	$('#antiair_input_table tbody').html(text);

	// 対空CI欄の描画 もうあるならいい
	if (!antiairCutinInputs.innerHTML) {
		const fragment = document.createDocumentFragment();
		for (const stage2 of fleet.allStage2) {
			const raw = ANTIAIR_CUTIN.find(v => v.id === stage2.cutin.id);
			const isDisabled = disabledCutin.includes(raw.id);

			const div = document.createElement('div');
			div.className = `general_tr d-flex px-2 anti_air_cutin_toggle${isDisabled ? ' disabled' : ''}`;
			div.dataset.cutinid = raw.id;

			const header = document.createElement('div');
			header.className = 'text-truncate w_50';

			const spanActive = document.createElement('i');
			spanActive.className = `pr-2 fa-eye${isDisabled ? '-slash' : ''}`;

			const spanName = document.createElement('span');
			spanName.className = '';
			spanName.textContent = raw.name + (raw.remarks ? ` (${raw.remarks})` : '');
			header.appendChild(spanActive);
			header.appendChild(spanName);

			const tdBonusR = document.createElement('div');
			tdBonusR.className = 'text-right w_15';
			tdBonusR.textContent = raw.adj[0];
			const tdBonusF = document.createElement('div');
			tdBonusF.className = 'text-right w_15';
			tdBonusF.textContent = raw.adj[1];

			const rate = stage2.rate * 100;
			const tdRate = document.createElement('div');
			tdRate.className = 'text-right w_20';
			tdRate.textContent = `${rate.toFixed(1)} %`;

			div.appendChild(header);
			div.appendChild(tdBonusR);
			div.appendChild(tdBonusF);
			div.appendChild(tdRate);
			fragment.appendChild(div);
		}

		antiairCutinInputs.innerHTML = '';
		antiairCutinInputs.appendChild(fragment);
	}
}

/**
 * 指定された装備群に指定されたカテゴリがあるかどうか
 * @param {ShipItem[]} items
 * @param {number} type
 * @returns {boolean} 存在するならtrue
 */
function hasTypeItem(items, type) {
	return items.some(v => v.type === type);
}

/**
 * 基地リセットボタン押下時
 * @param {JQuery} $this
 */
function btn_reset_landBase_Clicked($this) {
	const $landBase = $this.closest('.lb_tab');
	$landBase.find('.lb_plane').each((i, e) => {
		$(e).find('.slot').text(0);
		setLBPlaneDiv($(e));
	});
	$this.blur();
	calculate(true, false, false);
}

/**
 * 基地航空隊 機体ドラッグ終了時
 * @param {JQuery} $this
 */
function lb_plane_DragEnd($this) {
	const $plane = $this.closest('.lb_plane');
	if (isOut) {
		// 選択状況をリセット
		clearPlaneDiv($plane);
		$plane.css('opacity', '0.0');
		isOut = false;
		calculate(true, false, false);
	}
	$plane.animate({ 'opacity': '1.0' }, 500);
}

/**
 * 基地欄へ機体ドロップ時
 * @param {JQuery} $this
 * @param {*} ui
 */
function lb_plane_Drop($this, ui) {
	const $original = ui.draggable;
	const insertPlane = {
		id: castInt($original[0].dataset.planeid),
		remodel: castInt($original.find('.remodel_value')[0].textContent),
		prof: castInt($original.find('.prof_select')[0].dataset.prof),
		slot: castInt($original.find('.slot').text())
	};
	const prevPlane = {
		id: castInt($this[0].dataset.planeid),
		remodel: castInt($this.find('.remodel_value')[0].textContent),
		prof: castInt($this.find('.prof_select')[0].dataset.prof),
		slot: castInt($this.find('.slot').text())
	};
	$original.find('.remodel_select').addClass('zero');
	$this.find('.remodel_select').addClass('zero');
	TradeHTMLWithAnimation($original[0], $this[0], () => {
		setLBPlaneDiv($this, insertPlane);
		// 交換
		if (!isCtrlPress && !$('#drag_drop_copy').prop('checked')) {
			setLBPlaneDiv($original, prevPlane);
		}

		calculate(true, false, false);
	}, 150);
}


/**
 * 三角ボタンクリック時 表示情報のトグル
 * @param {JQuery} $this
 */
function btn_toggle_lb_info_Clicked($this) {
	const $tab = $this.closest('.lb_infomation');

	if ($this.hasClass('show_resource')) {
		// 通常表示に切り替え
		$this.removeClass('show_resource');
		if (isDefMode) $this.addClass('ml-auto');
		$tab.find('.battle_only').addClass('ml-auto').removeClass('ml-2');
		$tab.find('.btn_show_contact_rate_lb').removeClass('d-none');
		$tab.find('.ap_detail').removeClass('d-none');
		$tab.find('.resource').addClass('d-none');
	}
	else {
		// 資源の表示に切り替え
		$this.addClass('show_resource').removeClass('ml-auto');
		$tab.find('.battle_only').removeClass('ml-auto').addClass('ml-2');
		$tab.find('.btn_show_contact_rate_lb').addClass('d-none');
		$tab.find('.ap_detail').addClass('d-none');
		$tab.find('.resource').removeClass('d-none');
	}
}

/**
 * 防空モード切り替えボタン変更時
 */
function toggle_def_mode_Checked() {
	isDefMode = document.getElementById('toggle_def_mode')['checked'];
	calculate();
}

/**
 * 防空モード状態を変更する
 * @param {boolean} defMode trueなら防空計算モードにする
 */
function toggleDefenseMode(defMode) {
	document.getElementById('toggle_def_mode')['checked'] = defMode;
	isDefMode = defMode;
}

/**
 * 艦娘追加ボタン押下時
 * @param {JQuery} $this
 */
function btn_ship_create_Clicked($this) {
	const fleet_tab = $this.closest('.friendFleet_tab');
	const count = castInt($this[0].dataset.count);
	display_ship_count_Changed(fleet_tab, count + 1);

	// 新規追加された最後の入力欄の艦娘選択フォームを開く
	ship_name_span_Clicked(fleet_tab.find('.ship_tab:not(.d-none):last').find('.ship_name_span'));
}

/**
 * 艦娘装備リセットボタン押下時
 * @param {JQuery} $this
 */
function btn_reset_ship_plane_Clicked($this) {
	$this.closest('.ship_tab').find('.ship_plane').each((i, e) => { clearPlaneDiv($(e)) });
	calculate(false, true, false);
}

/**
 * 艦娘 機体ドラッグ開始時
 * @param {*} ui
 */
function ship_plane_DragStart(ui) {
	$(ui.helper)
		.addClass('ship_plane ' + getItemCss(castInt($(ui.helper).find('.plane_img').attr('alt'))))
		.css('width', 320);
	$(ui.helper).find('.slot_select_parent').remove();
	$(ui.helper).find('.btn_remove_plane').remove();
	$(ui.helper).find('.plane_lock').remove();
	$(ui.helper).find('.plane_unlock').remove();
	$(ui.helper).find('.item_special').remove();
	$(ui.helper).find('.prof_select_parent').addClass('mr-2');
}

/**
 * 艦娘 機体ドラッグ終了時
 * @param {JQuery} $this
 */
function ship_plane_DragEnd($this) {
	const $plane = $this.closest('.ship_plane');
	if (isOut) {
		// 選択状況をリセット
		clearPlaneDiv($plane);
		$plane.css('opacity', '0.0');
		isOut = false;
		calculate(false, true, false);
	}
	$plane.animate({ 'opacity': '1.0' }, 500);
}

/**
 * 艦娘 機体がドロップ対象上に位置
 * @param {JQuery} $this ドロップ対象 (!= ドラッグ中機体)
 * @param {*} ui
 */
function ship_plane_DragOver($this, ui) {
	const $original = ui.draggable.closest('.ship_plane');
	const shipID = castInt($this.closest('.ship_tab')[0].dataset.shipid);
	const planeID = castInt($original[0].dataset.planeid);
	if (planeID !== 0 && !checkInvalidItem(shipID, ITEM_DATA.find(v => v.id === planeID), castInt($this.index()))) {
		// 挿入先が装備不可だった場合暗くする
		ui.helper.stop().animate({ 'opacity': '0.2' }, 100);
		$this.removeClass('plane_draggable_hover');
		isOut = true;
	}
	else {
		ui.helper.stop().animate({ 'opacity': '1.0' }, 100);
		isOut = false;
	}
}

/**
 * 艦娘欄へ機体ドロップ時
 * @param {JQuery} $this
 * @param {*} ui
 */
function ship_plane_Drop($this, ui) {
	const $original = ui.draggable.closest('.ship_plane');
	// 機体入れ替え
	if ($original.length) {
		const insertPlane = {
			id: castInt($original[0].dataset.planeid),
			remodel: castInt($original.find('.remodel_value')[0].textContent),
			prof: castInt($original.find('.prof_select')[0].dataset.prof)
		};
		const prevPlane = {
			id: castInt($this[0].dataset.planeid),
			remodel: castInt($this.find('.remodel_value')[0].textContent),
			prof: castInt($this.find('.prof_select')[0].dataset.prof)
		};

		$original.find('.remodel_select').addClass('zero');
		$this.find('.remodel_select').addClass('zero');

		// ドロップされた装備が空でないなら
		if (insertPlane.id > 0) {
			// 挿入先が装備不可だった場合中止
			let shipID = castInt($this.closest('.ship_tab')[0].dataset.shipid);
			if (!checkInvalidItem(shipID, ITEM_DATA.find(v => v.id === insertPlane.id), castInt($this.index()))) return;
		}

		TradeHTMLWithAnimation($original[0], $this[0], () => {
			// 挿入
			setPlaneDiv($this, insertPlane);
			if (!isCtrlPress && !$('#drag_drop_copy').prop('checked')) {
				// 交換を行う
				setPlaneDiv($original, prevPlane);
			}

			calculate(false, true, false);
		}, 150);
	}
}

/**
 * 戦闘形式変更時
 * @param {JQuery} $this
 */
function cell_type_Changed($this, calc = true) {
	const $parentContent = $this.closest('.battle_content');
	const cellType = castInt($this.val());
	$parentContent.find('.enemy_content').each((i, e) => {
		if (cellType !== CELL_TYPE.grand && i > 5) $(e).addClass('d-none').removeClass('d-flex');
		else $(e).removeClass('d-none').addClass('d-flex');
	});

	if (cellType === CELL_TYPE.night) {
		$parentContent.addClass('is_night');
	}
	else {
		$parentContent.removeClass('is_night');
	}

	const $formation = $parentContent.find('.formation');
	changeFormationSelectOption($formation, cellType);

	if (calc) calculate();
}

/**
 * 陣形選択欄の読み込み
 * @param {JQuery} $formation 変更する .formation クラス
 * @param {number} cellType セル戦闘種別
 */
function changeFormationSelectOption($formation, cellType) {
	const prevVal = castInt($formation.val());
	$formation.find('option').each((i, e) => {
		if (cellType !== CELL_TYPE.grand) {
			if ($(e).val() < 10) $(e).removeClass('d-none');
			if ($(e).val() > 10) $(e).addClass('d-none');
			if (prevVal > 10) $formation.val(prevVal - 10);
		}
		if (cellType === CELL_TYPE.grand) {
			if ($(e).val() < 10) $(e).addClass('d-none');
			if ($(e).val() > 10) $(e).removeClass('d-none');
			if (prevVal === 4) $formation.val(11);
			else $formation.val(prevVal + 10);
		}
	});
}

/**
 * 列ヘッダークリック時
 * @param {JQuery} $this 押された列ヘッダー
 */
function sortable_td_Clicked($this) {
	const key = $this[0].dataset.sortkey;
	if (key) {
		$('#plane_sort_select').val(key);
		sort_Changed($('#plane_sort_select'));
	}
}

/**
 * 機体選択欄 機体カテゴリ変更時
 */
function plane_type_select_Changed($this = null) {
	// カテゴリ一回全部表示
	$('#plane_type_select .item_type').removeClass('d-none');
	if (!$this) {
		$this = $('#plane_type_select').find('.active');
	} else {
		// 一回全解除
		$('#plane_type_select .item_type').removeClass('active');
		$this.addClass('active');
	}

	// ツールチップもお掃除
	$('#modal_plane_select').find('.plane').tooltip('hide');

	//  安定ソート　データソースに対しソートをかける
	const sortKey = $('#plane_sort_select').val();
	switch (sortKey) {
		case 'default':
			// ソートなし → カテゴリ,id順
			ITEM_LIST.sort((a, b) => { return a.type !== b.type ? a.type - b.type : a.id - b.id; });
			break;
		case 'id':
		case 'cost':
			// これは昇順
			ITEM_LIST.sort((a, b) => a[sortKey] - b[sortKey]);
			break;
		case 'name':
			// 名称ソート
			ITEM_LIST.sort(function (a, b) { return a.name > b.name ? 1 : -1; });
			break;
		case 'land_base_power':
			ITEM_LIST.sort((a, b) => LandBaseItem.getFirePower(b.id, 18, 0) - LandBaseItem.getFirePower(a.id, 18, 0));
			break;
		case 'history':
			if (setting.selectedHistory[0]) {
				const lst = setting.selectedHistory[0];
				ITEM_LIST.sort((a, b) => lst.filter(v => v === b.id).length - lst.filter(v => v === a.id).length);
			}
			break;
		default:
			// その他降順
			ITEM_LIST.sort((a, b) => b[sortKey] - a[sortKey]);
			break;
	}

	// 選択時のカテゴリ
	let selectedType = castInt($this.length ? $this[0].dataset.type : 0);
	// ベース機体一覧
	/** @type {ItemDetail[]} */
	let org = [];
	// 検索語句
	let searchWord = $('#plane_word').val().trim();
	// 現状のカテゴリ
	let dispType = [];
	// 特定の艦娘が選ばれている場合の調整
	if ($target && $target.hasClass('ship_plane') && $target.closest('.ship_tab')[0].dataset.shipid) {
		const ship = SHIP_DATA.find(v => v.id === castInt($target.closest('.ship_tab')[0].dataset.shipid));
		// この艦娘の特殊装備可能装備を取得
		const special = SPECIAL_LINK_SHIP_ITEM.find(v => v.apiShip === ship.api);
		if (special) {
			dispType = special.itemType.concat();
		}
		else {
			// この艦娘の艦種の基本装備可能カテゴリを取得
			dispType = LINK_SHIP_ITEM.find(v => v.type === ship.type).e_type;
		}

		// 補強増設？
		const isExpandedSlot = $target.hasClass('expanded_slot');
		// 補強増設枠用特殊装備 -無くてもいいよ
		const exSpecialItems = [];
		// 補強増設枠チェック
		if (isExpandedSlot) {
			dispType = dispType.filter(v => EXPANDED_ITEM_TYPE.includes(v));

			const sps = EXPANDED_SPECIAL_ITEM.filter(v => v.shipApiIds.includes(ship.api));
			for (const sp of sps) {
				const spItem = ITEM_LIST.find(v => v.id === sp.itemId);
				// 補強増設枠に装備可能な特別装備があった場合、その装備カテゴリに追加
				if (spItem && !dispType.includes(spItem.type)) {
					dispType.push(spItem.type);
				}

				exSpecialItems.push(spItem);
			}

			// 潜水艦後部魚雷
			if (ship.type === 13 || ship.type === 14) {
				exSpecialItems.push(ITEM_LIST.find(v => v.id === 442));
				exSpecialItems.push(ITEM_LIST.find(v => v.id === 443));
				dispType.push(32);
			}
		}

		// スロット番号制限チェック
		const slotIndex = castInt($target.index());
		if (slotIndex >= 0) {
			const forbiddens = FORBIDDEN_LINK_SHIP_ITEM.find(v => v.shipId === ship.id && v.index.includes(slotIndex + 1));
			if (forbiddens) {
				// 禁止カテゴリ フィルタ
				dispType = dispType.filter(v => !forbiddens.itemType.includes(v));
			}
		}

		// 装備可能カテゴリはここの時点で確定
		// 前の表示値が残ってて変な選択してる場合はカテゴリを全てに変更
		if (!dispType || !dispType.find(v => convertItemType(v) === selectedType)) {
			selectedType = 0;
		}

		// 選択カテゴリに該当する装備を取得
		org = getItemsForIcon(selectedType);

		// 装備カテゴリに存在しない装備は除外
		org = org.filter(v => dispType.includes(v.type));

		// 装甲空母ではない場合、試製景雲(id:151)を削除する
		if (ship.type !== 18) {
			org = org.filter(v => v.id !== 151);
		}
		// 戦艦系ではない場合、15m二重測距儀+21号電探改二(id:142)を削除する
		if (![8, 9, 10].includes(ship.type)) {
			org = org.filter(v => v.id !== 142);
		}
		else if (!(ship.type2 === 19 && ship.ver > 0) && ship.type2 !== 37) {
			// 長門型改 or 大和型以外の戦艦から51砲2種を削除
			org = org.filter(v => v.id !== 128 && v.id !== 281);
		}

		// Richelieu改対応
		if (ship.id === 1472) {
			const ng = FORBIDDEN_LINK_SHIP_ITEM.find(v => v.shipId === ship.id).itemIDs;
			org = org.filter(v => !ng.includes(v.id));
		}

		// 補強増設　特別枠
		if (isExpandedSlot) {
			// 補強増設枠　タービン以外の強化機関を削除する
			org = org.filter(v => v.id !== 34 && v.id !== 87);

			const enabledIds = exSpecialItems.map(v => v.id);
			for (const spItem of exSpecialItems) {
				// 特別装備可能アイテム以外の同カテゴリアイテム削除
				org = org.filter(v => enabledIds.includes(v.id) || spItem.type !== v.type);
			}
		}
	}
	else if ($target && $target.hasClass('ship_plane')) {
		// 艦娘だけど艦娘の指定がない
		dispType = CB_PLANE_TYPE.concat(SP_PLANE_TYPE);
		if (!dispType.includes(selectedType)) {
			selectedType = 0;
		}
		org = getItemsForIcon(selectedType);
		// カテゴリ一覧にないもの除外
		org = org.filter(v => dispType.includes(v.type));
	}
	else {
		// 基地 機体だけ
		dispType = PLANE_TYPE;
		if (!dispType.includes(selectedType)) {
			selectedType = 0;
		}
		org = getItemsForIcon(selectedType);
		// カテゴリ一覧にないもの除外
		org = org.filter(v => dispType.includes(v.type));
	}

	// 装備可能カテゴリ表示変更
	const typeIcons = dispType.map(v => convertItemType(v));
	$('#plane_type_select').find('.item_type').each((i, e) => {
		const typeId = castInt($(e)[0].dataset.type);
		if (typeId === selectedType) $(e).addClass('active');
		else $(e).removeClass('active');

		if (typeId > 0 && !typeIcons.includes(typeId)) {
			$(e).addClass('disabled d-none')
		}
	});

	if (searchWord) {
		searchWord = replaceKnji(searchWord);
		org = org.filter(v => v.name.includes(searchWord) || v.id == searchWord);
	}

	// フィルタ反映
	const filterKey = $('#plane_filter_key_select').val();
	const filterValue = castInt($('#plane_filter_value').val());
	if (org.length >= 1 && org[0].hasOwnProperty(filterKey)) {
		org = org.filter(v => v[filterKey] >= filterValue);
	}

	createItemTable(org, selectedType);
}

/**
 * 検索語句が変更された(機体)
 */
function plane_word_TextChanged() {
	if (timer !== false) clearTimeout(timer);
	timer = setTimeout(function () { plane_type_select_Changed(); }, 250);
}

/**
 * お気に入りのみ表示クリック時
 */
function fav_only_Checked_Chenged() {
	setting.favoriteOnly = $('#fav_only').prop('checked');
	saveSetting();
	plane_type_select_Changed();
}

/**
 * 在庫有のみ表示クリック時
 */
function disp_in_stock_Checked_Chenged() {
	setting.inStockOnly = $('#disp_in_stock').prop('checked');
	saveSetting();
	plane_type_select_Changed();
}

/**
 * 個別表示クリック時
 */
function divide_stock_Checked_Chenged() {
	setting.isDivideStock = $('#divide_stock').prop('checked');
	saveSetting();
	plane_type_select_Changed();
}

/**
 * 配備済みも表示クリック時
 */
function disp_equipped_Checked_Chenged() {
	setting.visibleEquipped = $('#disp_equipped').prop('checked');
	saveSetting();
	plane_type_select_Changed();
}

/**
 * 基地機体はずすボタンクリック時
 * @param {JQuery} $this
 */
function btn_remove_lb_plane_Clicked($this) {
	const $plane = $this.closest('.lb_plane');
	clearPlaneDiv($plane);
	$plane.find('.slot').text(0);
	$plane.find('.slot_input').attr('max', 0);
	$plane.find('.slot_range').attr('max', 0);

	calculate(true, false, false);
}

/**
 * 各種選択欄　表示形式クリック時
 * @param {JQuery} $this
 */
function toggle_display_type_Clicked($this) {
	const $parentModal = $this.closest('.modal');
	$parentModal.find('.toggle_display_type').removeClass('selected');
	$this.addClass('selected');

	setting.displayMode[$parentModal.attr('id')] = $this.data('mode');
	saveSetting();
}

/**
 * 各種選択欄　ソート変更時
 * @param {JQuery} $this
 */
function sort_Changed($this) {
	const $parentModal = $this.closest('.modal');
	const sortKey = $parentModal.find('.sort_select').val();
	const sortTargetId = $target.closest('.contents').attr('id');
	if (sortTargetId) {
		setting.orderBy[sortTargetId] = sortKey;
		saveSetting();
	}
	if ($parentModal.attr('id') === 'modal_plane_select') plane_type_select_Changed();
}

/**
 * 艦載機選択欄　フィルタ変更時
 */
function plane_filter_Changed() {
	const filterKey = $('#plane_filter_key_select').val();
	const filterValue = castInt($('#plane_filter_value').val());
	const filterTargetId = $target.closest('.contents').attr('id');

	if (filterTargetId) {
		setting.planeFilter[filterTargetId] = [filterKey, filterValue];
		saveSetting();
	}

	plane_type_select_Changed();
}

/**
 * 機体名クリック時 (モーダル展開処理)
 * @param {JQuery} $this
 */
function plane_name_Clicked($this) {
	// 機体選択画面の結果を返却するターゲットのdiv要素を取得
	$target = $this.closest('.lb_plane');
	if (!$target.attr('class')) $target = $this.closest('.ship_plane');

	const selectedID = castInt($target[0].dataset.planeid);
	let activeTypeId = castInt($('#plane_type_select').find('.active')[0].dataset.type);

	// いったん全部出す
	$('#plane_type_select').find('.item_type').each((i, e) => { $(e).removeClass('disabled d-none'); });

	// 艦娘用装備選択モード
	if ($target.hasClass('ship_plane')) {
		// カテゴリ：陸上機 が選択されていたら全てにする
		if (LB_PLANE_TYPE.includes(activeTypeId)) {
			activeTypeId = 0;
		}

		$('#plane_type_select').find('.item_type').each((i, e) => {
			const typeId = castInt($(e)[0].dataset.type);
			// 陸上機を非表示に
			if (LB_PLANE_TYPE.includes(typeId)) {
				$(e).addClass('disabled d-none');
			}
			// 選択変更
			if (typeId === activeTypeId) {
				$(e).addClass('active');
			}
			else {
				$(e).removeClass('active');
			}
		});
	}

	const selectParent = $target.closest('.contents').attr('id');
	if (selectParent) {
		// ソート復元
		$('#modal_plane_select').find('.sort_select').val(setting.orderBy[selectParent]);
		// フィルタ復元
		$('#plane_filter_key_select').val(setting.planeFilter[selectParent][0]);
		$('#plane_filter_value').val(setting.planeFilter[selectParent][1]);
	}

	plane_type_select_Changed();
	$('#modal_plane_select').find('.btn_remove').prop('disabled', selectedID === 0);
	$('#modal_plane_select').modal('show');
}

/**
 * モーダル内機体選択時
 * @param {JQuery} $this
 */
function modal_plane_Selected($this) {
	const plane = { id: castInt($this[0].dataset.planeid), remodel: castInt($this[0].dataset.remodel) };
	if ($target.attr('class').includes('lb_plane')) {
		// 基地航空隊に機体セット
		setLBPlaneDiv($target, plane);
		// お札が待機になってるなら集中または防空に変更
		const $ohuda = $target.closest('.lb_tab').find('.ohuda_select');
		if ($ohuda && castInt($ohuda.val(), -1) < 0) {
			$ohuda.val(isDefMode ? 0 : 2);
		}
	}
	// 艦娘に機体セット
	else if ($target.attr('class').includes('ship_plane')) {
		setPlaneDiv($target, plane);
	}
	if (plane.id) updatePlaneSelectedHistory(plane.id);
	$('#modal_plane_select').modal('hide');
}

/**
 * モーダル内機体はずすクリック時
 * @param {JQuery} $this
 */
function modal_plane_select_btn_remove_Clicked($this) {
	if ($this.prop('disabled')) return false;
	clearPlaneDiv($target);
	$('#modal_plane_select').modal('hide');
}

/**
 * 機体プリセット展開クリック時
 * @param {JQuery} $this
 */
function btn_plane_preset_Clicked($this) {
	let parentId = -1;
	$target = $this.closest('.lb_tab');
	if (!$target.attr('class')) {
		// 艦娘が展開先である場合
		$target = $this.closest('.ship_tab');
		parentId = castInt($target[0].dataset.shipid);
	}
	$('#modal_plane_preset').data('parentid', parentId);
	loadPlanePreset();
	$('#modal_plane_preset').modal('show');
	$this.blur();
}

/**
 * 機体プリセット内 プリセット一覧名クリック
 * @param {JQuery} $this
 */
function plane_preset_tr_Clicked($this) {
	const preset = planePreset.find(v => v.id === castInt($this.data('presetid')));
	$('.preset_tr').removeClass('preset_selected');
	$this.addClass('preset_selected');
	drawPlanePresetPreview(preset);
}

/**
 * プリセット名変更時
 * @param {JQuery} $this
 */
function preset_name_Changed($this) {
	// 入力検証　全半40文字くらいで
	const input = $this.val().trim();
	const $btn = $this.closest('.modal').find('.btn_commit_preset');
	if (input.length > 50) {
		$this.addClass('is-invalid');
		$btn.prop('disabled', true);
	}
	else if (input.length === 0) {
		$this.addClass('is-invalid');
		$btn.prop('disabled', true);
	}
	else {
		$this.removeClass('is-invalid');
		$this.addClass('is-valid');
		$btn.prop('disabled', false);
	}
}

/**
 * 機体プリセット内 プリセット保存クリック時
 * @param {JQuery} $this
 */
function btn_commit_plane_preset_Clicked($this) {
	$this.prop('disabled', true);
	// プリセット変更 & 保存
	updatePlanePreset();
	loadPlanePreset();
}

/**
 * 機体プリセット内 プリセット削除クリック時
 * @param {JQuery} $this
 */
function btn_delete_plane_preset_Clicked($this) {
	$this.prop('disabled', true);
	deletePlanePreset();
	loadPlanePreset();
}

/**
 * 機体プリセット内 プリセット展開クリック時
 */
function btn_expand_plane_preset_Clicked() {
	const presetId = castInt($('.preset_selected').data('presetid'));
	const preset = planePreset.find(v => v.id === presetId);
	if (preset) {
		// プリセット展開
		if ($target.attr('class').includes('lb_tab')) {
			$target.find('.lb_plane').each((i, e) => {
				const plane = { id: 0, remodel: 0 };
				if (preset.planes.length > i) {
					plane.id = preset.planes[i].id;
					plane.remodel = preset.planes[i].remodel;
					setLBPlaneDiv($(e), plane);
				}
			});
			// お札が待機になってるなら集中または防空に変更
			$target.find('.ohuda_select').val(isDefMode ? 0 : 2);
		}
		else {
			$target.find('.ship_plane').each((i, e) => {
				const plane = { id: 0, remodel: 0 };
				if (preset.planes.length > i) {
					plane.id = preset.planes[i].id;
					plane.remodel = preset.planes[i].remodel;
					setPlaneDiv($(e), plane);
				}
			});
		}
	}
	$('#modal_plane_preset').modal('hide');
}

/**
 * 表示隻数変更時
 * @param {JQuery} $this friendFleet_tab id指定で。
 * @param {boolean} cancelCalculate 計算を行わない場合はtrue
 */
function display_ship_count_Changed($this, displayCount, cancelCalculate = false) {
	$this.find('.ship_tab').each((i, e) => {
		if (i < displayCount) $(e).removeClass('d-none');
		else $(e).addClass('d-none');
	});

	// 現在地を格納 6隻埋まったら新規追加ボタンは非表示に => 遊撃部隊なら +1
	const $button = $this.find('.btn_ship_create');
	$button[0].dataset.count = displayCount;
	if (displayCount >= getMaxShipCount()) {
		$button[0].dataset.count = getMaxShipCount();
		$button.addClass('d-none');
	}
	else {
		$button.removeClass('d-none');
	}

	if (!cancelCalculate) calculate(false, true, false);
}

/**
 * 艦娘機体はずすボタンクリック時
 * @param {JQuery} $this
 */
function btn_remove_ship_plane_Clicked($this) {
	clearPlaneDiv($this.closest('.ship_plane'));
	calculate(false, true, false);
}


/**
 * 対空砲火ステ表示チェック変更
 */
function visible_anti_air_status_Clicked() {
	// チェックが入っていない場合は再計算(計算対象が第2艦隊になるため)
	setting.visibleAntiAirStatus = document.getElementById('visible_anti_air_status')['checked'];
	saveSetting();
	calculate(false, false, false);
}

/**
 * 艦隊表示変更時
 */
function fleet_select_tab_Clicked() {
	// チェックが入っていない場合は再計算(計算対象が第2艦隊になるため)
	if (!$('#union_fleet').prop('checked')) {
		calculate(false, true, false);
	}
}

/**
 * 艦娘保留クリック
 * @param {JQuery} $this
 */
function btn_ship_toggle_Clicked($this) {
	hideTooltip($this[0]);
	const shipTab = $this.closest('.ship_tab');

	// 今の情報を一意shipNoを付けて一部格納
	const currentShip = new Ship(getUniqueId());
	currentShip.id = castInt(shipTab[0].dataset.shipid);
	currentShip.level = castInt(shipTab.find('.ship_level').text());
	currentShip.luck = castInt(shipTab.find('.ship_luck').text());

	shipTab.find('.ship_plane:not(.ui-draggable-dragging)').each((j, e) => {
		const $e = $(e);
		const item = new ShipItem(castInt($e[0].dataset.planeid),
			castInt($e.find('.slot').text()),
			castInt($e.find('.remodel_value')[0].textContent),
			castInt($e.find('.prof_select')[0].dataset.prof)
		);
		item.slotNo = j;
		if (!$e.hasClass('d-none')) {
			currentShip.items.push(item);
		}
	});

	// 保留リストを展開
	$target = shipTab;
	setReserveShipList(currentShip);
	$('#modal_ship_reserve').modal('show');
}

/**
 * 保留リストの再度描画
 * @param {Ship} currentShip
 */
function setReserveShipList(currentShip) {
	// 現行データ描画
	document.getElementById('current_ship_info').innerHTML = createReserveShipHtml(currentShip, false);

	// 保留リスト追加ボタン表示制御
	if (currentShip.id < 1 && currentShip.items.filter(v => v.id > 0).length === 0) {
		// 空データならボタン無効化
		document.getElementById('btn_add_reserve')['disabled'] = true;
	}
	else {
		if (reserveList.find(v => v.shipNo === currentShip.shipNo)) {
			// 既に追加済みならボタン無効化
			document.getElementById('btn_add_reserve')['disabled'] = true;
		}
		else {
			// ボタンを有効化し、保留リスト待機状態に
			document.getElementById('btn_add_reserve')['disabled'] = false;
			currentReserved = currentShip;
		}
	}

	// 保留リスト描画
	const table = document.createDocumentFragment();
	for (const ship of reserveList) {
		const div = createDiv('reserve_ship general_tr m-1 p-2');
		div.dataset.reservedId = ship.shipNo;
		div.innerHTML = createReserveShipHtml(ship);
		table.appendChild(div);
	}

	document.getElementById('reserve_list').innerHTML = '';
	document.getElementById('reserve_list').appendChild(table);

	// 更新
	saveSessionStorage('reserve_list', reserveList);
}

/**
 * ShipクラスからそれっぽいHTMLを生成
 * @param {Ship} ship 展開対象Shipクラス
 * @param {boolean} [enabledRemoveButton=true] リスト削除ボタンいるか要らないか
 * @returns {string} 
 */
function createReserveShipHtml(ship, enabledRemoveButton = true) {

	if (ship.updateAirPower) {
		ship.updateAirPower();
	}
	const raw = SHIP_DATA.find(v => v.id === ship.id);
	let itemText = '';
	for (let i = 0; i < ship.items.length; i++) {
		const item = ship.items[i];
		itemText += `
			<div class="d-flex">
				<div class="ml-1 align-self-center">
					<img src="../img/type/${item.itype ? `icon${item.itype}` : 'undefined'}.png" alt="${item.itype}" class="img-size-30">
				</div>
				<div class="ml-1 align-self-center reserve_long_text">${item.name}</div>
				${(item.remodel ? `<div class="align-self-center reserve_remodel"><i class="text_remodel fas fa-star"></i><span class="text_remodel">+${item.remodel}</span></div>` : '')}
			</div>`;
	}

	return `<div class="d-flex">
		<div class="align-self-center">${raw ? `<img src="../img/ship/${raw.id}.png" class="ship_img mr-1">` : ''}</div>
		<div class="align-self-center flex-grow-1">
			<div class="font_size_11">
				<span class=" text-primary">Lv: ${ship.level}</span>
				${ship.airPower ? `<span class="ml-2">制空値: ${ship.airPower}</span>` : ''}
			</div>
			<div class="d-flex">
				<div class="reserve_long_text">${raw ? raw.name : '艦娘未指定'}</div>
			</div>
		</div>
		${enabledRemoveButton ? '<div class="btn_remove_reserve btn_icon"><i class="fas fa-times"></i></div>' : ''}
		</div>
	</div>
	<div class="mt-1">
		${itemText}
	</div>`;
}

/**
 * 保留リストに追加
 */
function btn_add_reserve_Clicked() {
	if (currentReserved) {
		reserveList.push(currentReserved);
		inform_success('保留リストに追加されました。');
		// 再構築
		setReserveShipList(currentReserved);
	}
}

/**
 * 保留艦娘クリック
 * @param {JQuery} $this
 */
function reserve_ship_Clicked($this) {
	const key = $this[0].dataset.reservedId;

	const ship = reserveList.find(v => v.shipNo === key);
	if (ship && $target && $target.hasClass('ship_tab')) {
		// クリックされた情報を復帰して閉じる
		setShipDiv($target, ship.id, ship.level);

		$target.find('.ship_plane:not(.ui-draggable-dragging)').each((j, e) => {
			const item = ship.items.find(v => v.slotNo === j);
			if (item) {
				setPlaneDiv($(e), { id: item.id, remodel: item.remodel, prof: item.level, slot: item.slot }, true);
			}
		});
	}

	$('#modal_ship_reserve').modal('hide');
}

/**
 * 保留艦娘削除クリック
 * @param {JQuery} $this
 */
function btn_remove_reserve_Clicked($this, e) {
	e.stopPropagation();

	hideTooltip($this[0]);
	const key = $this.closest('.reserve_ship')[0].dataset.reservedId;

	if (reserveList.find(v => v.shipNo === key)) {
		reserveList = reserveList.filter(v => v.shipNo !== key);
		inform_success('保留リストから削除しました。');
		// 再構築
		setReserveShipList(currentReserved);
	}
}

/**
 * 保留リスト全リセット
 */
function btn_reset_reserve_Clicked() {
	reserveList = [];
	inform_success('保留リスト情報をリセットしました。');
	// 再構築
	setReserveShipList(currentReserved);
}

/**
 * 艦娘無効クリック
 * @param {JQuery} $this
 */
function ship_disabled_Changed($this) {
	if ($this.hasClass('disabled')) {
		// 有効にする
		$this.closest('.ship_tab').removeClass('opacity4');
		$this.removeClass('disabled');
		$this.children().removeClass('fa-eye-slash').addClass('fa-eye no_capture');
	}
	else {
		// 無効にする
		$this.closest('.ship_tab').addClass('opacity4');
		$this.addClass('disabled');
		$this.children().removeClass('fa-eye no_capture').addClass('fa-eye-slash');
	}
	calculate(false, true, false);
}

/**
 * 連合艦隊チェック変更時
 */
function union_fleet_Checked() {
	const isUnion = $('#union_fleet').prop('checked');
	if (isUnion && $('#yugeki_fleet').prop('checked')) {
		$('#yugeki_fleet').prop('checked', false);
	}
	// 7隻表示がなされていたら矯正
	const activeTab = $('.friendFleet_tab.active');
	const backTab = $('.friendFleet_tab:not(.active)');
	if (isUnion && activeTab.find('.ship_tab:not(.d-none)').length >= 6) {
		display_ship_count_Changed(activeTab, 6, true);
	}
	if (isUnion && backTab.find('.ship_tab:not(.d-none)').length >= 6) {
		display_ship_count_Changed(backTab, 6, true);
	}
	calculate(false, true, false);
}

/**
 * 遊撃部隊チェック変更時
 */
function yugeki_fleet_Checked() {
	const isYugeki = $('#yugeki_fleet').prop('checked');
	if (isYugeki && $('#union_fleet').prop('checked')) {
		$('#union_fleet').prop('checked', false);
	}
	// 6隻表示埋まっていたら矯正 タブは両方適用する
	const activeTab = $('.friendFleet_tab.active');
	const activeCount = activeTab.find('.ship_tab:not(.d-none)').length
	if (isYugeki && activeCount === 6) {
		display_ship_count_Changed(activeTab, 7, true);
	}
	// 遊撃じゃなくなったら後ろに隠す
	else if (!isYugeki && activeCount >= 6) {
		display_ship_count_Changed(activeTab, 6, true);
	}

	const backTab = $('.friendFleet_tab:not(.active)');
	const backCount = backTab.find('.ship_tab:not(.d-none)').length
	if (isYugeki && backCount === 6) {
		display_ship_count_Changed(backTab, 7, true);
	}
	// 遊撃じゃなくなったら後ろに隠す
	else if (!isYugeki && backCount >= 6) {
		display_ship_count_Changed(backTab, 6, true);
	}

	calculate(false, true, false);
}

/**
 * 艦娘一覧モーダル展開クリック時
 * @param {JQuery} $this
 */
function ship_name_span_Clicked($this) {
	$target = $this.closest('.ship_tab');
	const selectedID = castInt($target[0].dataset.shipid);

	// 選択艦娘がいるなら
	if (selectedID) {
		$('#modal_ship_select').find('.btn_remove').prop('disabled', false);
	}
	else $('#modal_ship_select').find('.btn_remove').prop('disabled', true);

	createShipTable();
	$('#modal_ship_select').modal('show');
}

/**
 * 艦娘外す
 * @param {JQuery} $this
 */
function btn_remove_ship_Clicked($this) {
	const $parentTab = $this.closest('.fleet_tab');
	const $closedTab = $this.closest('.ship_tab');

	clearShipDiv($closedTab);

	const $btnAdd = $parentTab.find('.btn_ship_create');
	const count = castInt($btnAdd[0].dataset.count);
	if (count >= 2) {
		// ケツに回して非表示にする
		$closedTab.addClass('d-none');
		$btnAdd.before($closedTab);
		$btnAdd.removeClass('d-none');
		$btnAdd[0].dataset.count = count - 1;
	}

	calculate(false, true, false);
}


/**
 * 検索語句が変更された(艦娘)
 */
function ship_word_TextChanged() {
	if (timer !== false) clearTimeout(timer);
	timer = setTimeout(function () { createShipTable(); }, 250);
}

/**
 * 艦種クリック時
 * @param {JQuery} $this
 */
function ship_type_select_Changed($this) {
	$('#ship_type_select').find('.ship_type').removeClass('active');
	$this.addClass('active');

	createShipTable();
}

/**
 * 艦娘一覧モーダル 艦娘クリック時
 * @param {JQuery} $this
 */
function modal_ship_Selected($this) {
	const shipId = castFloat($this[0].dataset.shipid);
	const level = castInt($this[0].dataset.level);
	const area = castInt($this[0].dataset.area);
	const luck = castInt($this[0].dataset.luck);
	setShipDiv($target, shipId, level, area, luck);

	updateShipSelectedHistory(shipId);
	$('#modal_ship_select').modal('hide');
}

/**
 * 艦娘一覧モーダルはずすクリック時
 * @param {JQuery} $this
 */
function modal_ship_select_btn_remove_Clicked($this) {
	if ($this.prop('disabled')) return false;
	clearShipDiv($target);
	$('#modal_ship_select').modal('hide');
}

/**
 * 戦闘回数変更時
 * @param {JQuery} $this
 */
function battle_count_Changed($this) {
	// 敵入力欄生成
	createEnemyInput(castInt($this.val()));

	let needAlert = false;
	// なんらかの出撃基地があれば基地派遣設定ボタンを目立たせる
	$('#lb_tab_parent').find('.ohuda_select').each((i, e) => {
		if (castInt($(e).val()) === 2) {
			$('.btn_lb_target').removeClass('btn-outline-success');
			$('.btn_lb_target').addClass('btn-outline-danger');
			$('.lb_target_alert').removeClass('d-none');
			needAlert = true;
		}
	});

	if (needAlert) {
		inform_warning('敵艦との交戦回数が変更されました。基地航空隊の派遣先を確認してください。');
	}
	calculate(true, false, true);
}

/**
 * 基地派遣先決定ボタンの有効無効表示
 */
function btn_lb_target_Clicked() {
	// 現行の基地タゲを取得
	const landBaseAll = createLandBaseInstance();

	// リセット
	const btns = document.getElementById('land_base_target_buttons').getElementsByClassName('btn-sm');
	for (const element of btns) {
		element.classList.remove('active');
		element.getElementsByTagName('input')[0]['checked'] = false;
		if (!element.classList.contains('btn-outline-secondary')) {
			element.classList.remove('disabled');
		}
	}

	// タゲをもとに、ボタンを光らせる 札が出撃以外なら無効化！
	for (const landBase of landBaseAll.landBases) {
		if (landBase.mode === 2) {
			const btn = document.getElementsByName(`lb${landBase.baseNo}_target`)[landBase.target[0]];
			if (btn) {
				btn.parentElement.classList.add('active');
				btn['checked'] = true;
			}
			const btn2 = document.getElementsByName(`lb${landBase.baseNo}_target2`)[landBase.target[1]];
			if (btn2) {
				btn2.parentElement.classList.add('active');
				btn2['checked'] = true;
			}
		}
		else {
			for (const element of document.getElementsByName(`lb${landBase.baseNo}_target`)) {
				element.parentElement.classList.add('disabled');
			}
			for (const element of document.getElementsByName(`lb${landBase.baseNo}_target2`)) {
				element.parentElement.classList.add('disabled');
			}
		}
	}

	// 基地派遣設定ボタンの色を戻す
	$('.btn_lb_target').removeClass('btn-outline-danger');
	$('.btn_lb_target').addClass('btn-outline-success');
	$('.lb_target_alert').addClass('d-none');

	$('#modal_lb_target').modal('show');
}

/**
 * 敵艦隊表示形式変更
 */
function enemy_fleet_display_mode_Changed() {
	const isDisplayImage = $('#enemy_fleet_display_image').prop('checked');
	$('.enemy_content').each((i, e) => {
		if (isDisplayImage) {
			$(e).removeClass('py-0_5').addClass('pb-0_1 min-h-31px');
			$(e).find('.enemy_name_img_parent').removeClass('d-none').addClass('d-flex');
			$(e).find('.enemy_name_text').addClass('d-none');
		}
		else {
			$(e).removeClass('pb-0_1 min-h-31px').addClass('py-0_5');
			$(e).find('.enemy_name_img_parent').addClass('d-none').removeClass('d-flex');
			$(e).find('.enemy_name_text').removeClass('d-none');
		}
	});

	setting.enemyFleetDisplayImage = isDisplayImage;
	saveSetting();
}

/**
 * 戦闘全体リセット時
 * @param {JQuery} $this
 */
function btn_reset_battle_Clicked($this) {
	const $tmp = isDefMode ? $('#air_raid_enemies') : $this.closest('.battle_content');
	$tmp[0].dataset.celldata = '';
	$tmp.find('.enemy_content').each((i, e) => clearEnemyDiv($(e)));
	$this.blur();
	calculate();
}

/**
 * 検索語句が変更された(敵艦)
 */
function enemy_word_TextChanged() {
	if (timer !== false) clearTimeout(timer);
	timer = setTimeout(function () { createEnemyTable(); }, 250);
}

/**
 * 敵艦インデックスクリック時
 * @param {JQuery} $this
 */
function enemy_index_Clicked($this) {
	if ($this.closest('.enemy_content').hasClass('is_dead')) {
		$this.closest('.enemy_content').removeClass('is_dead');
	}
	else {
		$this.closest('.enemy_content').addClass('is_dead');
	}
	calculate(false, false, true);
}

/**
 * 敵艦名クリック時
 * @param {JQuery} $this
 */
function enemy_name_Clicked($this) {
	$target = $this.closest('.enemy_content');
	const selectedID = castInt($target[0].dataset.enemyid);
	$("#enemy_type_select").change();
	if (selectedID !== 0) $('#modal_enemy_select').find('.btn_remove').prop('disabled', false);
	else $('#modal_enemy_select').find('.btn_remove').prop('disabled', true);
	$('#modal_enemy_select').modal('show');
}

/**
 * 敵一覧モーダル 敵艦名クリック時
 * @param {JQuery} $this
 */
function modal_enemy_Selected($this) {
	// 敵艦セット
	setEnemyDiv($target, castInt($this[0].dataset.enemyid));
	$('#modal_enemy_select').modal('hide');
}

/**
 * 敵一覧モーダル 敵はずすクリック時
 * @param {JQuery} $this
 */
function modal_enemy_select_btn_remove($this) {
	if ($this.prop('disabled')) return false;
	// 選択状況をリセット
	clearEnemyDiv($target);
	$('#modal_enemy_select').modal('hide');
}


/**
 * 海域一括入力クリック
 */
function btn_world_expand_Clicked() {
	$target = $('.battle_content:first');
	$('#expand_target').text(1);
	$('#btn_expand_enemies').addClass('d-none');
	$('#btn_continue_expand').prop('disabled', true);
	$('#btn_continue_expand').removeClass('d-none');
	$('#expand_target_parent').removeClass('d-none');
	$('#enemy_pattern_tbody').html(``);
	$('#modal_enemy_pattern').modal('show');
}

/**
 * 海域一覧クリック時
 * @param {JQuery} $this
 */
function btn_enemy_preset_Clicked($this) {
	$target = $this.closest('.battle_content');
	if (isDefMode) $target = $('#air_raid_enemies');
	$('#btn_expand_enemies').removeClass('d-none');
	$('#btn_expand_enemies').prop('disabled', true);
	$('#btn_continue_expand').addClass('d-none');
	$('#expand_target_parent').addClass('d-none');
	$('#modal_enemy_pattern').modal('show');
}


/**
 * 対空砲火詳細クリック
 * @param {JQuery} $this
 */
function btn_stage2_Clicked($this) {
	const $battleContent = $this.closest('.battle_content');
	const battleNo = castInt($battleContent.find('.battle_no').text()) - 1;
	const formationId = castInt($battleContent.find('.formation').val());

	$('#modal_stage2_detail').data('battleno', battleNo);
	$('#modal_stage2_detail').data('formationid', formationId);

	calculateStage2Detail();
	$('#modal_stage2_detail').modal('show');
}

/**
 * 対空砲火シミュ内搭載数変更
 */
function stage2_slot_input_Changed() {
	const $this = $('#stage2_detail_slot');
	// 入力検証 -> 数値 かつ 0 以上 max 以下　違ってたら修正
	const value = validateInputNumber($this.val(), castInt($this.attr('max')));
	$this.val(value);
	calculateStage2Detail();
}

/**
 * 射撃回避補正任意調整
 * @param {JQuery} $this 
 */
function free_modify_input_Changed($this) {
	// 入力検証 -> 数値 かつ 0 以上 max 以下　違ってたら修正
	const value = validateInputNumberFloat($this.val(), castFloat($this.attr('max')));

	if ($this.val() !== value) $this.val(value);
	calculateStage2Detail();
}

/**
 * 簡易撃墜シミュレート
 */
function calculateStage2Detail() {
	const battleNo = castInt($('#modal_stage2_detail').data('battleno'));
	const formationId = castInt($('#modal_stage2_detail').data('formationid'));
	const all = updateEnemyFleetInfo();
	const battleData = all.battles[battleNo];
	const slot = castInt($('#stage2_detail_slot').val());
	const avoid = castInt($('#stage2_detail_avoid').val());
	let sumAntiAirBonus = 0;
	let tableHtml = '';
	let cutInWarnning = false;

	// 自由入力欄活性化
	$('#free_modify').find('input').prop('readonly', avoid !== 5);
	if (avoid < 5) {
		$('#free_anti_air_weight').val(AVOID_TYPE[avoid].adj[0]);
		$('#free_anti_air_bornus').val(AVOID_TYPE[avoid].adj[1]);
	}

	let idx = 0;
	for (let index = 0; index < battleData.enemies.length; index++) {
		const enemy = battleData.enemies[index];
		if (enemy.id === 0 || enemy.isDead) continue;
		const rate = Math.floor(slot * battleData.stage2[avoid][0][idx]);
		const fix = battleData.stage2[avoid][1][idx];
		const sum = rate + fix;
		if (ANTIAIR_CUTIN_ENEMY.includes(enemy.id)) cutInWarnning = true;
		sumAntiAirBonus += enemy.antiAirBonus;
		tableHtml += `
		<tr class="${sum >= slot ? 'stage2_table_death' : sum >= (slot / 2) ? 'stage2_table_half' : ''}">
			<td class="font_size_12 text-left td_enm_name" data-toggle="tooltip" data-html="true"
				data-title="<div><div>加重対空値：${enemy.antiAirWeight}</div><div>防空ボーナス：${enemy.antiAirBonus}</div></div>">
				<span class="ml-2">
					${drawEnemyGradeColor(enemy.name)}
				</span>
			</td>
			<td class="text-right">
				<span class="text-right">${(battleData.stage2[avoid][0][idx++] * 100).toFixed(1)}% (${rate}機)</span>
			</td>
			<td class="text-right">${fix}機</td>
			<td class="text-right">${sum}機</td>
		</tr>
		`;
	}

	// 陣形補正
	const formation = FORMATION.find(v => v.id === formationId);
	const aj1 = formation ? formation.correction : 1.0;
	// 艦隊防空値 [陣形補正 * 各艦の艦隊対空ボーナス値の合計] * 2
	const sumfleetAntiAir = Math.floor(aj1 * sumAntiAirBonus) * 2;

	// 空襲なので撃墜ないよ注意
	if (battleData.cellType !== CELL_TYPE.airRaid) $('#is_air_raid').addClass('d-none');
	else $('#is_air_raid').removeClass('d-none');
	// 対空CIあるよ注意
	if (battleData.cellType !== CELL_TYPE.airRaid && cutInWarnning) $('#stage2_warning').removeClass('d-none');
	else $('#stage2_warning').addClass('d-none');

	$('#stage2_table tbody').html(tableHtml);
	$('.td_enm_name').tooltip();
	$('#stage2_detail_formation').text(formation.name);
	$('#sumfleetAntiAir').text(sumfleetAntiAir);
}

/**
 * 敵編成一覧名クリック時
 * @param {JQuery} $this
 */
function node_tr_Clicked($this) {
	$('.node_tr').removeClass('node_selected');
	$this.addClass('node_selected');
	createEnemyPattern();
}

/**
 * 敵編成パターン名クリック時
 * @param {JQuery} $this
 */
function pattern_Changed($this) {
	const pattern = castInt($this.data('disp'), -1);
	if (pattern < 0) return;
	createEnemyPattern(pattern);
}

/**
 * 敵艦表示モード変更時
 * @param {JQuery} $this
 */
function enemy_display_mode_Changed($this) {
	setting.enemyDisplayImage = $this.attr('id').includes('enemy_display_image');
	saveSetting();
	const pattern = castInt($('#enemy_pattern_select').find('.nav-link.active').data('disp'));
	if (pattern > 0) createEnemyPattern(pattern);
	else createEnemyPattern();
}

/**
 * マップ上のセルクリック時
 * @param {JQuery} $this
 */
function node_Clicked($this) {
	$('.node_tr').removeClass('node_selected');
	const $targetNode = $('.node_tr[data-node="' + $this.attr('title') + '"');
	$targetNode.addClass('node_selected');
	createEnemyPattern();
}

/**
 * マップ上のセルダブルクリック時
 */
function node_DoubleClicked() {
	// 選択マスがなければ何もしない(例外回避)
	if (!$('.node_tr').hasClass('node_selected')) return;
	if ($('#btn_expand_enemies').hasClass('d-none')) {
		btn_continue_expand_Clicked();
		$('.node_tr').removeClass('node_selected');
	}
	else {
		btn_expand_enemies();
	}
}

/**
 * 敵編成展開クリック時
 */
function btn_expand_enemies() {
	expandEnemy();
	$('#modal_enemy_pattern').modal('hide');
}

/**
 * 連続展開
 */
function btn_continue_expand_Clicked() {
	let currentBattle = castInt($('#expand_target').text());
	// 1戦目を入れた時点でクリアかける
	if (currentBattle === 1) {
		clearEnemyDivAll();
	}
	// 今から入れる分生成
	createEnemyInput(currentBattle);
	// 次の戦闘用意
	$('#expand_target').text(currentBattle + 1);

	$target = $(document.getElementsByClassName('battle_content')[currentBattle - 1]);
	// 通常通り展開
	expandEnemy();

	// 展開されたことを示す視覚効果
	$('#enemy_pattern_tbody').html(`<div>${currentBattle} 戦目の敵艦隊が挿入されました。</div><div>続ける場合は再度戦闘マスを選択してください。<div>`);
	$('#enemy_pattern_select').html('<li class="nav-item"><a class="nav-link ' + (mainColor === "#000000" ? '' : 'nav-link-dark') + ' active" data-toggle="tab" href="#">編成1</a></li>');
	$('#enemy_pattern_air_power').text('0');
	$('#enemy_display_mode_parent').addClass('d-none').removeClass('d-flex');
	$('.node_selected').removeClass('node_selected');
	$('#btn_continue_expand').prop('disabled', true);

	// なんらかの出撃基地があれば基地派遣設定ボタンを目立たせる
	$('#lb_tab_parent').find('.ohuda_select').each((i, e) => {
		if (castInt($(e).val()) === 2) {
			$('.btn_lb_target').removeClass('btn-outline-success');
			$('.btn_lb_target').addClass('btn-outline-danger');
			$('.lb_target_alert').removeClass('d-none');
		}
	});

	// 空襲編成入れてきた or 10戦目まで入力されたら閉じて終了
	if (isDefMode || currentBattle === 10) {
		$('#modal_enemy_pattern').modal('hide');
		if (currentBattle === 10) {
			inform_warning('敵艦との交戦回数が変更されました。基地航空隊の派遣先を確認してください。');
		}
	}
}

/**
 * 撃墜表マウスin
 * @param {JQuery} $this
 */
function shoot_down_table_tbody_MouseEnter($this) {
	const $tr = $this.closest('tr');
	const css = $tr[0].dataset.css;
	$tr.addClass('bg-hover');
	$tr.find('.td_plane_name').addClass(css);
	$('#shoot_down_table_tbody').find(`tr[data-si="${$tr[0].dataset.si}"]:first`).find('.td_name').addClass('bg-hover');
}

/**
 * 撃墜表マウスleave
 * @param {JQuery} $this
 */
function shoot_down_table_tbody_MouseLeave($this) {
	const $tr = $this.closest('tr');
	const css = $tr[0].dataset.css;
	$tr.removeClass('bg-hover');
	$tr.find('.td_plane_name').removeClass(css);
	$('#shoot_down_table_tbody').find(`tr[data-si="${$tr[0].dataset.si}"]:first`).find('.td_name').removeClass('bg-hover');
}

/**
 * グラフマウスin
 * @param {JQuery} $this
 */
function progress_area_MouseEnter($this) {
	const $bar = $this.find('.result_bar');
	const status = castInt($bar.data('airstatus'));
	const rowIndex = castInt($bar.attr('id').replace('result_bar_', ''));
	$bar.addClass('bar_ex_status' + status);
	$('#rate_row_' + rowIndex).addClass('bg_status' + status);
}

/**
 * グラフマウスleave
 * @param {JQuery} $this
 */
function progress_area_MouseLeave($this) {
	const $bar = $this.find('.result_bar');
	const status = castInt($bar.data('airstatus'));
	const rowIndex = castInt($bar.attr('id').replace('result_bar_', ''));
	$bar.removeClass('bar_ex_status' + status);
	$('#rate_row_' + rowIndex).removeClass('bg_status' + status);
}

/**
 * 確率テーブルマウスin
 * @param {JQuery} $this
 */
function rate_table_MouseEnter($this) {
	const rowIndex = castInt($this.closest('tr').attr('id').replace('rate_row_', ''));
	const $bar = $('#result_bar_' + rowIndex);
	const status = castInt($bar.data('airstatus'));
	$bar.addClass('bar_ex_status' + status);
	$('#rate_row_' + rowIndex).addClass('bg_status' + status);
}

/**
 * 確率テーブルマウスLeave
 * @param {JQuery} $this
 */
function rate_table_MouseLeave($this) {
	const rowIndex = castInt($this.closest('tr').attr('id').replace('rate_row_', ''));
	const $bar = $('#result_bar_' + rowIndex);
	const status = castInt($bar.data('airstatus'));
	$bar.removeClass('bar_ex_status' + status);
	$('#rate_row_' + rowIndex).removeClass('bg_status' + status);
}

/**
 * 敵撃墜表マウスin
 * @param {JQuery} $this
 */
function enemy_shoot_down_table_tbody_MouseEnter($this) {
	const $tr = $this.closest('tr');
	const rowIndex = castInt($tr[0].dataset.rowindex);
	const css = $tr[0].dataset.css;
	$tr.addClass('bg-hover');
	$tr.find('.td_plane_name').addClass(css);
	$('#enemy_shoot_down_tbody').find('.enemy_no_' + rowIndex + ':first').find('.td_name').addClass('bg-hover');
}

/**
 * 敵撃墜表マウスleave
 * @param {JQuery} $this
 */
function enemy_shoot_down_table_tbody_MouseLeave($this) {
	const $tr = $this.closest('tr');
	const rowIndex = castInt($tr[0].dataset.rowindex);
	const css = $tr[0].dataset.css;
	$tr.removeClass('bg-hover');
	$tr.find('.td_plane_name').removeClass(css);
	$('#enemy_shoot_down_tbody').find('.enemy_no_' + rowIndex + ':first').find('.td_name').removeClass('bg-hover');
}

/**
 * 計算もっと！
 */
function btn_more_calc_Clicked() {
	const prevCount = $('#calculate_count').val();
	$('#calculate_count').val(100000);

	calculate(false, false, false);

	inform_success('計算が完了しました。(+100,000 回出撃分)');

	$('#calculate_count').val(prevCount);
	$('#calculate_confirm').addClass('d-none');
}

/**
 * 表示戦闘タブ変更時
 * @param {JQuery} $this
 */
function display_battle_tab_Changed($this) {
	displayBattle = castInt($this.find('.nav-link').data('disp')) - 1;

	// 陣形を取得して変更
	if (displayBattle <= selectedFormations.length) {
		document.getElementById('fleet_formation').value = selectedFormations[displayBattle];
	}

	calculate(false, false, false);
}

/**
 * 結果表示欄表示物変更時
 */
function display_result_Changed() {
	if ($('#display_land_base_result').prop('checked')) {
		for (let i = 1; i < 7; i++) {
			$('#rate_row_' + i + ':not(.disabled_tr)').removeClass('d-none');
			$('#result_bar_' + i).closest('.progress_area:not(.disabled_bar)').removeClass('d-none').addClass('d-flex');
		}
	}
	else {
		for (let i = 1; i < 7; i++) {
			$('#rate_row_' + i).addClass('d-none');
			$('#result_bar_' + i).closest('.progress_area').addClass('d-none').removeClass('d-flex');
		}
	}

	if ($('#display_fleet_result').prop('checked')) {
		$('#rate_row_7:not(.disabled_tr)').removeClass('d-none');
		$('#result_bar_7').closest('.progress_area:not(.disabled_bar)').removeClass('d-none').addClass('d-flex');
	}
	else {
		$('#rate_row_7').addClass('d-none');
		$('#result_bar_7').closest('.progress_area').addClass('d-none').removeClass('d-flex');
	}

	if ($('#display_bar').prop('checked')) {
		$('#result_bar_parent').removeClass('d-none');
	}
	else {
		$('#result_bar_parent').addClass('d-none');
	}

	if ($('#display_enemy_table').prop('checked')) {
		$('#enemy_shoot_down_table_parent').removeClass('d-none');
	}
	else {
		$('#enemy_shoot_down_table_parent').addClass('d-none');
	}
}

/**
 * 基地計算結果詳細展開
 * @param {JQuery} $this
 */
function land_base_detail_Clicked($this) {
	// 詳細計算対象の取得
	landBaseDetailCalculate(castInt($this.data('base_no')), 0, true);
	$('#modal_result_detail').modal('show');
}

/**
 * 基地計算結果詳細展開
 * @param {JQuery} $this
 */
function land_base_bar_Clicked($this) {
	const $bar = $this.find('.result_bar');
	const rowIndex = castInt($bar.attr('id').replace('result_bar_', ''));
	if (rowIndex < 7) {
		// 詳細計算対象の取得
		landBaseDetailCalculate(castInt($('#rate_row_' + rowIndex).data('base_no')), 0, true);
		$('#modal_result_detail').modal('show');
	}
}

/**
 * 基地計算結果詳細展開
 * @param {JQuery} $this
 */
function simple_lb_progress_Clicked($this) {
	const id = $this.closest('.lb_tab').attr('id');
	const rowIndex = castInt(id.replace('lb_item', ''));
	const $tr = $('#rate_row_' + (rowIndex * 2 - 1));
	if ($tr.length) {
		landBaseDetailCalculate(castInt($tr.data('base_no')), 0, true);
		$('#modal_result_detail').modal('show');
	}
}

/**
 * 計算結果詳細展開
 * @param {JQuery} $this
 */
function fleet_slot_Clicked($this) {
	// 詳細計算対象の取得
	const shipId = castInt($this[0].dataset.shipid);
	const shipNo = castInt($this[0].dataset.si);
	const slot = castInt($this[0].dataset.slot);
	if ($this.find('.td_plane_name').text() === '-' || $this.find('.td_plane_name').text() === '') {
		return;
	}

	const isOk = fleetSlotDetailCalculate(shipNo, slot, shipId);
	if (isOk) {
		$('#modal_result_detail').modal('show');
	}
}

/**
 * 敵計算結果詳細展開
 * @param {JQuery} $this
 */
function enemy_slot_Clicked($this) {
	// 詳細計算対象の取得
	const enemyNo = castInt($this.closest('tr')[0].dataset.rowindex);
	const slot = castInt($this.closest('tr')[0].dataset.slot);
	enemySlotDetailCalculate(enemyNo, slot, true);
	$('#modal_result_detail').modal('show');
}

/**
 * 内部熟練度120計算機体カテゴリ変更時
 * @param {JQuery} $this
 */
function innerProfSetting_Clicked($this) {
	const clickedType = castInt($this.find('input').attr('id').replace('prof120_', ''));
	const checked = $this.find('input').prop('checked');
	if (checked && !initialProf120Plane.includes(clickedType)) {
		initialProf120Plane.push(clickedType);
	}
	else if (!checked && initialProf120Plane.includes(clickedType)) {
		initialProf120Plane = initialProf120Plane.filter(v => v !== clickedType);
	}

	setting.initialProf120 = initialProf120Plane.sort((a, b) => a - b);
	saveSetting();

	calculate(true, true, false);
}

/**
 * シミュレート回数変更時
 * @param {JQuery} $this
 */
function calculate_count_Changed($this) {
	// 入力検証 -> 数値 かつ 0 以上 max 以下　違ってたら修正
	const value = validateInputNumber($this.val(), 100000);

	$this.val(value);
	setting.simulateCount = value;
	// ローカルストレージへ保存
	saveSetting();
}

/**
 * クリップボード保存チェック
 */
function clipboard_mode_Clicked() {
	// 未対応の場合強制 false
	if (typeof ClipboardItem !== "function") {
		$('#clipboard_mode').prop('checked', false);
		$('#cant_use_clipboard').removeClass('d-none');
	}

	setting.copyToClipboard = $('#clipboard_mode').prop('checked');
	saveSetting();
}

/**
 * よく使う装備削除クリック時
 */
function btn_reset_selected_plane_history_Clicked() {
	const $modal = $('#modal_confirm');
	$modal.find('.modal-body').html(`
		<div>よく使うとして登録された機体情報を削除します。</div>
		<div class="mt-3">よろしければ、OKボタンを押してください。</div>
	`);
	confirmType = "deleteSelectedPlaneHistory";
	$modal.modal('show');
}

/**
 * よく使う艦娘削除クリック時
 */
function btn_reset_selected_ship_history_Clicked() {
	const $modal = $('#modal_confirm');
	$modal.find('.modal-body').html(`
		<div>よく使うとして登録された艦娘情報を削除します。</div>
		<div class="mt-3">よろしければ、OKボタンを押してください。</div>
	`);
	confirmType = "deleteSelectedShipHistory";
	$modal.modal('show');
}

/**
 * 仮想敵艦展開時
 */
function manage_manual_enemu_content_Shown() {
	if (!document.getElementById('created_manual_enemies').innerHTML.trim()) {
		drawManualEnemies();
	}
}

/**
 * 手動敵艦展開
 */
function drawManualEnemies() {
	const table = document.getElementById('created_manual_enemies');
	table.innerHTML = '';

	for (const i of UNKNOWN_ENEMY) {
		const enemy = new Enemy(i);

		const tr = document.createElement('div');
		tr.className = 'manual_enemy_tr general_tr d-flex px-3 py-2';
		tr.dataset.virtualid = enemy.id;

		// 画像 id　ラッパー
		const td_head = document.createElement('div');
		td_head.className = 'd-flex manual_enemy_head';
		// 画像
		const td_img = document.createElement('img');
		td_img.className = 'enemy_name_img d-none d-md-block';
		td_img.src = '../img/enemy/' + enemy.id + '.png';
		td_head.appendChild(td_img);
		// ID 名称 ラッパー
		const id_name_td = document.createElement('div');
		id_name_td.className = 'ml-1 manual_enemy_name_td';
		// ID
		const id_td = document.createElement('div');
		id_td.className = 'text-primary font_size_11';
		id_td.textContent = 'ID : ' + (enemy.id + 1500);
		const td_name = document.createElement('div');
		td_name.textContent = enemy.name;

		id_name_td.appendChild(id_td);
		id_name_td.appendChild(td_name);
		td_head.appendChild(id_name_td);
		tr.appendChild(td_head);

		const slots = document.createElement('div');
		slots.className = 'manual_enemy_slots';

		for (let j = 0; j < enemy.equipments.length; j++) {
			const item = enemy.equipments[j];
			const slot = enemy.rawSlots[j];

			if (item.id <= 0) continue;

			const slotDiv = document.createElement('div');
			slotDiv.className = 'manual_enemy_slot d-flex';

			const slotCount = document.createElement('div');
			slotCount.className = 'mr-2 d-none d-md-inline manual_enemy_slot_count';
			slotCount.textContent = slot < 0 ? 0 : slot;

			const img = document.createElement('img');
			img.className = 'img-size-25';
			img.src = '../img/type/icon' + item.itype + '.png';

			const planeName = document.createElement('div');
			planeName.className = 'ml-1'
			planeName.textContent = item.name;

			slotDiv.appendChild(slotCount);
			slotDiv.appendChild(img);
			slotDiv.appendChild(planeName);
			slots.appendChild(slotDiv);
		}
		tr.appendChild(slots);


		const td_ap = document.createElement('div');
		td_ap.className = 'manual_enemy_ap_td';
		td_ap.textContent = (enemy.airPower === 0 && enemy.landBaseAirPower ? `(${enemy.landBaseAirPower})` : enemy.airPower);
		tr.appendChild(td_ap);

		const td_aaw = document.createElement('div');
		td_aaw.className = 'manual_enemy_aaw_td';
		td_aaw.textContent = enemy.antiAirWeight;
		tr.appendChild(td_aaw);

		const td_aabo = document.createElement('div');
		td_aabo.className = 'manual_enemy_aabo_td';
		td_aabo.textContent = enemy.antiAirBonus;
		tr.appendChild(td_aabo);

		table.appendChild(tr);
	}
}

/**
 * 仮想敵艦展開
 * @param {JQuery} $this
 */
function manul_enemy_Clicked($this) {
	for (let i = 0; i < 4; i++) {
		document.getElementsByClassName('enemy_slot')[i].value = -1;
		document.getElementsByClassName('enemy_slot')[i].value = 0;
	}

	const enemy = ENEMY_DATA.find(v => v.id === castInt($this[0].dataset.virtualid));
	if (enemy) {
		document.getElementById('manual_enemy_img').src = `../img/enemy/${enemy.id}.png`;
		document.getElementById('manual_enemy_id').textContent = enemy.id;
		document.getElementById('manual_enemy_name').textContent = enemy.name;
		setEnemyPlaneCombobox(enemy);

		for (let i = 0; i < enemy.slot.length; i++) {
			if (i >= 4) {
				break;
			}
			document.getElementsByClassName('enemy_slot')[i].value = enemy.slot[i] < 0 ? 0 : enemy.slot[i];
			document.getElementsByClassName('enemy_planes')[i].value = enemy.eqp[i] < 0 ? 0 : enemy.eqp[i];
		}
		document.getElementById('manual_aa').value = enemy.aa;
	}
	else {
		inform_warning('エラーが発生しました。');
		return;
	}

	calculateVirtualEnemy();
	$('#modal_manual_enemy').modal('show');
}

/**
 * 対空砲火シミュ内搭載数変更
 * @param {JQuery} $this
 */
function manual_enemy_input_Changed($this) {
	// 入力検証 -> 数値 かつ 0 以上 max 以下　違ってたら修正
	const value = validateInputNumber($this.val(), castInt($this.attr('max')));
	$this.val(value);

	calculateVirtualEnemy();
}

/**
 * 仮想敵艦艦種変更時
 * @param {Object} enemy 敵艦
 */
function setEnemyPlaneCombobox(enemy) {
	let optgroup = null;
	let prevType = -1;
	const parent = document.createElement('div');
	parent.innerHTML = '';

	const noneOp = document.createElement('option');
	noneOp.textContent = `-`;
	noneOp.value = -1;
	parent.appendChild(noneOp);

	const items = ENEMY_ITEM.filter(v => true);

	// 機体マスタ読込
	for (const plane of items) {
		const type = Math.abs(plane.type);
		if (prevType !== type) {
			if (optgroup !== null) {
				parent.appendChild(optgroup);
			}

			prevType = type;
			optgroup = document.createElement('optgroup');

			let typeObj = ITEM_API_TYPE.find(v => v.id === type);
			if (typeObj) {
				optgroup.label = typeObj.name;
			}
			else {
				typeObj = OTHER_TYPE.find(v => v.id === type);
				optgroup.label = typeObj ? typeObj.name : "未定義";
			}
		}

		const option = document.createElement('option');
		option.textContent = `${plane.id}: ${plane.name}`;
		option.value = plane.id;

		optgroup.appendChild(option);
	}
	parent.appendChild(optgroup);

	for (const elem of document.getElementsByClassName('enemy_planes')) {
		elem.innerHTML = parent.innerHTML;
		elem.options[0].selected = true;
	}
}

/**
 * 仮想敵艦制空値計算
 */
function calculateVirtualEnemy() {
	let sumAp = 0;
	for (let i = 0; i < 4; i++) {
		const slots = castInt(document.getElementsByClassName('enemy_slot')[i].value);
		const planeId = castInt(document.getElementsByClassName('enemy_planes')[i].value);
		const apLabel = document.getElementsByClassName('manual_enemy_ap')[i];

		if (planeId < 500 || slots <= 0) {
			apLabel.textContent = 0;
			continue;
		}
		const plane = ENEMY_ITEM.find(v => v.id === planeId);
		if (!plane) {
			apLabel.textContent = 0;
			document.getElementsByClassName('enemy_planes')[i].options[0].selected = true;
			continue;
		}

		const ap = PLANE_TYPE.includes(plane.type) ? Math.floor(plane.antiAir * Math.sqrt(slots)) : 0;
		apLabel.textContent = ap;
		sumAp += ap;
	}
	document.getElementById('manual_enemy_sumAP').textContent = sumAp;
}

/**
 * 敵艦手動更新
 */
function commit_enemy_Clicked() {
	const enemyId = castInt(document.getElementById('manual_enemy_id').textContent);

	if (UNKNOWN_ENEMY.includes(enemyId)) {
		const old = ENEMY_DATA.find(v => v.id === enemyId);
		const enemy = { id: enemyId, type: old.type, name: old.name, slot: [], eqp: [], orig: old.orig, aa: 0 }

		enemy.aa = castInt(document.getElementById('manual_aa').value);

		const parent = document.getElementById('enemy_slot_info');
		for (let i = 0; i < 4; i++) {
			const slot = castInt(parent.getElementsByClassName('enemy_slot')[i].value);
			const planeId = castInt(parent.getElementsByClassName('enemy_planes')[i].value);

			// 装備かチェック
			const item = ENEMY_ITEM.find(v => v.id === planeId);
			if (item) {
				// 装備と搭載数を格納 機体じゃないなら搭載数は0
				enemy.slot.push(PLANE_TYPE.includes(item.type) ? slot : 0);
				enemy.eqp.push(item.id);
			}
			else {
				// 不正な値
				enemy.slot.push(-1);
				enemy.eqp.push(-1);
			}
		}

		let manualEnemies = loadLocalStorage('manual_enemies') || [];

		const index = manualEnemies.findIndex(v => v.id === enemy.id);
		if (index < 0) {
			manualEnemies.push(enemy);
		}
		else {
			manualEnemies[index] = enemy;
		}

		const enemyIndex = ENEMY_DATA.findIndex(v => v.id === enemy.id);
		ENEMY_DATA[enemyIndex] = enemy;
		saveLocalStorage('manual_enemies', manualEnemies);

		drawManualEnemies();
		inform_success('敵艦情報が更新されました。');
		calculate();
		$('#modal_manual_enemy').modal('hide');
	}
}

/**
 * サーバー値に戻す
 */
function rollback_enemy_Clicked() {
	let manualEnemies = loadLocalStorage('manual_enemies');
	const enemyId = castInt(document.getElementById('manual_enemy_id').textContent);
	if (manualEnemies) {
		manualEnemies = manualEnemies.filter(v => v.id !== enemyId);
		saveLocalStorage('manual_enemies', manualEnemies);
		location.reload();
	}
}

/**
 * 表示戦闘タブ変更時
 * @param {JQuery} $this
 */
function btn_target_Clicked($this) {
	const value = castInt($this[0].dataset.target) - 1;
	$this.parent().find('input[type="hidden"]').val(value);
}

/**
 * 詳細画面　再計算クリック
 */
function btn_calculate_detail() {
	// 計算回数の変更
	const originalCount = $('#calculate_count').val();
	$('#calculate_count').val($('#detail_calculate_count').val());

	detailCalculate();

	$('#btn_calculate_detail').prop('disabled', true);
	$('#calculate_count').val(originalCount);
}

/**
 * 表示戦闘タブ変更時
 * @param {JQuery} $this
 */
function detail_slot_tab_Changed($this) {
	if ($this.find('.nav-link').hasClass('disabled')) return;
	$('#detail_info').data('slot_no', castInt($this.data('slot_no')));
	detailCalculate();
}

/**
 * グラフ表示機体切り替え
 * @param {JQuery} $this
 */
function btn_show_detail_Clicked($this) {
	$('#detail_info').data('slot_no', castInt($this[0].dataset.slot_no));
	detailCalculate();
}


/**
 * 搭載数分布をクリップボードに出力 JSON
 */
function btn_output_slot_dist_Clicked() {
	try {
		const labels = chartInstance.data.labels;
		const rates = chartInstance.data.datasets[0].data;

		// 表示するスロットの最大値 基本は取りうる値の最大値から。
		let maxSlot = getArrayMax(labels.map(v => castInt(v)));
		const detailMode = $('#detail_info').data('mode');
		if (detailMode === 'land_base_detail') {
			// 基地は18機から表示
			maxSlot = 18;
		}
		else if ($('#slot_detail').prop('checked')) {
			// 基地以外はマスタから最大搭載数を取得
			const $id = $('#detail_legend').find('.legend_name');
			const slotNo = castInt($('#detail_info').data('slot_no'));
			if (detailMode === 'enemy_slot_detail') {
				const enemy = ENEMY_DATA.find(v => v.id === castInt($id.data('enemyid')));
				if (enemy) maxSlot = enemy.slot[slotNo];
			}
			else if (detailMode === 'fleet_slot_detail') {
				const ship = SHIP_DATA.find(v => v.id === castInt($id.data('shipid')));
				if (ship) maxSlot = ship.slot[slotNo];
			}
		}

		const output = [];
		if (labels.length > 0) {
			for (let i = maxSlot; i >= 0; i--) {
				const index = labels.indexOf(i);
				if (index > -1) {
					output.push({ slot: i, rate: rates[index] / 100 });
				}
				else {
					output.push({ slot: i, rate: 0 });
				}
			}
		}

		$('#dist_text').removeClass('d-none');
		$('#dist_text').val(JSON.stringify(output));
		copyInputTextToClipboard($('#dist_text'));
		$('#dist_text').addClass('d-none');
	} catch (error) {
		inform_danger('出力に失敗しました。');
	}
}
/**
 * 搭載数分布をクリップボードに出力 表計算ソフト系
 */
function btn_output_slot_dist_table_Clicked() {
	try {
		const labels = chartInstance.data.labels;
		const rates = chartInstance.data.datasets[0].data;

		// 表示するスロットの最大値 基本は取りうる値の最大値から。
		let maxSlot = getArrayMax(labels.map(v => castInt(v)));
		const detailMode = $('#detail_info').data('mode');
		if (detailMode === 'land_base_detail') {
			// 基地は18機から表示
			maxSlot = 18;
		}
		else if ($('#slot_detail').prop('checked')) {
			// 基地以外はマスタから最大搭載数を取得
			const $id = $('#detail_legend').find('.legend_name');
			const slotNo = castInt($('#detail_info').data('slot_no'));
			if (detailMode === 'enemy_slot_detail') {
				const enemy = ENEMY_DATA.find(v => v.id === castInt($id.data('enemyid')));
				if (enemy) maxSlot = enemy.slot[slotNo];
			}
			else if (detailMode === 'fleet_slot_detail') {
				const ship = SHIP_DATA.find(v => v.id === castInt($id.data('shipid')));
				if (ship) maxSlot = ship.slot[slotNo];
			}
		}

		let text = '';
		if (labels.length > 0) {
			for (let i = maxSlot; i >= 0; i--) {
				const index = labels.indexOf(i);
				if (i !== maxSlot) text += '\r\n';

				if (index > -1) text += `${i}\t${rates[index] / 100}`;
				else text += `${i}\t0`;
			}
		}

		$('#dist_text').removeClass('d-none');
		$('#dist_text').val(text);
		copyInputTextToClipboard($('#dist_text'));
		$('#dist_text').addClass('d-none');
	} catch (error) {
		inform_danger('出力に失敗しました。');
	}
}

/**
 * 確認ダイアログOKボタンクリック時
 */
function modal_confirm_ok_Clicked() {
	switch (confirmType) {
		case "deleteLocalStorageAll":
			window.localStorage.clear();
			break;
		case "resetPlaneStock":
			deleteLocalStorage('planeStock');
			updateItemList();
			break;
		case "resetShipStock":
			deleteLocalStorage('shipStock');
			break;
		case "resetFavoritePlane":
			setting.favoritePlane = [];
			setting.favoriteOnly = false;
			$('#fav_only').prop('checked', false);
			saveSetting();
			updateItemList();
			break;
		case "resetFavoriteShip":
			setting.favoriteShip = [];
			setting.favoriteOnlyShip = false;
			$('#fav_only_ship').prop('checked', false);
			saveSetting();
			break;
		case "deleteSelectedPlaneHistory":
			setting.selectedHistory[0] = [];
			saveSetting();
			break;
		case "deleteSelectedShipHistory":
			setting.selectedHistory[1] = [];
			saveSetting();
			break;
		case "Error":
			break;
		default:
			break;
	}
	$('#modal_confirm').modal('hide');
}

/**
 * メニュー「編成保存」ボタンクリック
 */
function btn_save_preset_Clicked() {
	// アップロード非チェック
	$('#allow_upload_preset').prop('checked', false);
	$('#upload_option').addClass('d-none');
	$('#btn_upload_preset').addClass('d-none');

	// 現在のアクティブタブの情報を取得
	const activeTab = getActivePreset();
	// 編成メモはアクティブタブ情報から取得
	document.getElementById('preset_remarks').value = activeTab.memo;
	document.getElementById('preset_remarks').classList.remove('is-valid');
	document.getElementById('input_preset_name').classList.remove('is-valid');

	// ローカルストレージ編成の取得
	const presets = loadLocalStorage('presets');
	if (presets) {
		const preset = presets.find(v => v[0] === activeTab.id);

		if (preset) {
			// ローカルストレージにすでに保存済みの編成だったら
			document.getElementById('input_preset_name').value = preset[1];
			// 編成メモは最後に確定したメモのものを使う
			document.getElementById('preset_remarks').value = preset[3];
			// 編成の更新を行って終わり
			updateMainPreset();
			inform_success('編成の上書き更新が完了しました。');
			return;
		}
		else {
			// ローカルストレージに存在しない編成だったら
			document.getElementById('input_preset_name').value = '';
		}
	}
	else {
		// ローカルストレージ編成がそもそも存在しなかったら
		document.getElementById('input_preset_name').value = '';
	}

	$('#modal_main_preset').find('.btn_commit_preset').prop('disabled', true);
	$('#modal_main_preset').modal('show');
}

/**
 * 別名で保存ボタンクリック
 */
function btn_save_preset_sub_Clicked() {
	// アップロード非チェック
	$('#allow_upload_preset').prop('checked', false);
	$('#upload_option').addClass('d-none');
	$('#btn_upload_preset').addClass('d-none');

	// 編成メモはアクティブタブ情報から取得
	const activeTab = getActivePreset();
	document.getElementById('preset_remarks').value = activeTab.memo;
	document.getElementById('preset_remarks').classList.remove('is-valid');

	// 現在のローカル編成の情報を取得
	const presets = loadLocalStorage('presets');
	if (presets) {
		const preset = presets.find(v => v[0] === getActivePreset().id);
		if (preset) {
			// ローカルストレージにすでに保存済みの編成だったら
			document.getElementById('input_preset_name').value = preset[1];

			// 新しい名前で保存しようとする　-> 別名保存ボタンにする
			const $btn = $('#modal_main_preset').find('.btn_commit_preset');
			$btn.text('別名で保存');
			$btn.addClass('rename');
			$btn.prop('disabled', true);
			$('#modal_main_preset').modal('show');

			return;
		}
	}

	// 上記以外の場合は編成上書きクリック時と同じ挙動させる
	btn_save_preset_Clicked();
}

/**
 * メニュー「メモ」クリック時
 */
function btn_memo_Clicked() {
	// 現在のアクティブタブからメモを取得
	const activePreset = getActivePreset();
	let memo = '';
	if (activePreset && activePreset.memo) {
		memo = activePreset.memo;
	}

	const memoTextArea = document.getElementById('preset_memo');
	memoTextArea.value = memo;
	preset_memo_Changed($(memoTextArea));

	const commitBtn = document.getElementById('modal_preset_memo').getElementsByClassName('btn_commit_preset')[0];
	commitBtn.classList.add('d-none');

	// 現在のアクティブタブの情報を取得
	const presets = loadLocalStorage('presets');
	if (presets) {
		const preset = presets.find(v => v[0] === getActivePreset().id);
		if (preset) {
			// ローカルストレージにすでに保存済みの編成だったらメモ保存ボタンを表示
			commitBtn.classList.remove('d-none');
		}
	}

	$('#modal_preset_memo').modal('show');
}

/**
 * 固定メニュー表示時
 */
function fixedMenuShown() {
	document.getElementById('main').classList.add('mr-md-5');
	setting.visibleFixedMenu = true;
	saveSetting();
}
/**
 * 固定メニュー表示時
 */
function fixedMenuHidden() {
	document.getElementById('main').classList.remove('mr-md-5');
	setting.visibleFixedMenu = false;
	saveSetting();
}

/**
 * メニュー「資料室」ボタンクリック
 */
function btn_reference_Clicked() {
	initializeReference();
	$('#modal_reference').modal('show');
}

/**
 * メニュー「Twitter」ボタンクリック
 */
async function btn_twitter_Clicked() {
	const url = MYURL + '?d=' + encodePreset();
	let shortURL = url;
	let result = false;
	await postURLData(url)
		.then(json => {
			if (json.error || !json.shortLink) console.log(json);
			else {
				result = true;
				shortURL = json.shortLink;
			}
		})
		.catch(error => console.error(error));

	if (result) {
		window.open('https://twitter.com/share?url=' + shortURL);
	}
	else {
		inform_danger('共有リンクの生成に失敗しました。');
	}
}

/**
 * 元に戻すボタンクリック
 */
function btn_undo_Clicked() {
	const preset = getActivePreset();
	const history = preset.history;
	const nowIndex = history.index + 1;
	if (nowIndex >= history.histories.length || document.getElementById('btn_undo').classList.contains('disabled') || document.getElementById('menu_undo').classList.contains('disabled')) {
		return;
	}
	const tmp = history.histories.concat();

	expandMainPreset(decodePreset(history.histories[nowIndex]));
	calculate();

	history.index = nowIndex;
	history.histories = tmp;

	updateActivePreset(preset);

	// 次回できなさそうなら無効化
	if (nowIndex + 1 === history.histories.length) {
		document.getElementById('btn_undo').classList.add('disabled');
		document.getElementById('menu_undo').classList.add('disabled');
	}

	document.getElementById('btn_redo').classList.remove('disabled');
	document.getElementById('menu_redo').classList.remove('disabled');
}

/**
 * やりなおすボタンクリック
 */
function btn_redo_Clicked() {
	const preset = getActivePreset();
	const history = preset.history;
	const nowIndex = history.index - 1;
	if (nowIndex < 0 || document.getElementById('btn_redo').classList.contains('disabled') || document.getElementById('menu_redo').classList.contains('disabled')) {
		return;
	}
	const tmp = history.histories.concat();

	expandMainPreset(decodePreset(history.histories[history.index - 1]));
	calculate();

	history.index = nowIndex;
	history.histories = tmp;

	updateActivePreset(preset);

	// 次回できなさそうなら無効化
	if (nowIndex - 1 < 0) {
		document.getElementById('btn_redo').classList.add('disabled');
		document.getElementById('menu_redo').classList.add('disabled');
	}
	else {
		document.getElementById('btn_redo').classList.remove('disabled');
		document.getElementById('menu_redo').classList.remove('disabled');
	}
}

/**
 * URL短縮ボタンクリック
 */
async function btn_url_shorten_Clicked() {
	const button = document.getElementById('btn_url_shorten');
	const textbox = document.getElementById('input_url');
	const url = textbox.value.trim();

	hideTooltip($(button)[0]);

	if (button.classList.contains('shortening')) return;
	button.classList.add('shortening');
	button.textContent = '短縮中';

	// urlチェック
	if (!url) {
		textbox.value = "";
		inform_warning('URLやデッキビルダー形式の文字列を入力してください。');
	}
	else if (!url.match(/^(https?|ftp)(:\/\/[-_.!~*\'()a-zA-Z0-9;\/?:\@&=+\$,%#]+)$/)) {
		textbox.value = "";

		// 隠し機能
		// デッキビルダー形式チェック
		const preset = readDeckBuilder(url);
		if (preset) {
			expandMainPreset(preset, preset[0][0].length > 0, true, false);
			// 対空砲火を有効にする
			document.getElementById('adapt_stage2')['checked'] = true;
			calculate();
			if (showDeckSelector()) {
				inform_success('編成の反映に成功しました。');
			}
		}
		// 所持装備チェック
		else if (readEquipmentJson(url)) {
			updateItemList();
			inform_success('所持装備の反映に成功しました。');
		}
		else if (readShipJson(url)) {
			inform_success('在籍艦娘の反映に成功しました。');
		}
		else {
			inform_danger('入力値の読み込みに失敗しました。');
		}
	}
	else if (!url.match(/^(https:\/\/aircalc.page.link\/)([.!~*\'()a-zA-Z0-9;\/?:\@&=+\$,%#]+)$/)) {
		await postURLData(url)
			.then(json => {
				if (json.error || !json.shortLink) {
					textbox.value = "";
					inform_danger('入力されたURLの短縮に失敗しました。');
				}
				else {
					textbox.value = json.shortLink;
					inform_success('URLの短縮に成功しました。');
				}
			})
			.catch(error => {
				textbox.value = "";
				inform_danger('入力値の読み込みに失敗しました。');
			});
	}

	button.textContent = '読み込み';
	button.classList.remove('shortening');
}

/**
 * プリセットメモ変更時
 * @param {JQuery} $this
 */
function preset_remarks_Changed($this) {
	// 入力検証　全半400文字くらいで
	const input = $this.val().trim();
	if (input.length > 400) {
		$this.addClass('is-invalid');
	}
	else {
		$this.removeClass('is-invalid');
		$this.addClass('is-valid');
	}
}

/**
 * プリセットメモ(本格入力欄)変更時
 * @param {JQuery} $this
 */
function preset_memo_Changed($this) {
	// 入力検証
	preset_remarks_Changed($this);

	$this.removeClass('is-valid');

	// サイズ自動補正
	const rowLength = $this.val().match(/\n/g);
	$this.attr('rows', (rowLength && rowLength.length ? rowLength.length + 2 : 2));

	// プレビュー欄に反映
	document.getElementById('preset_memo_view').innerHTML = AutoLink($this.val().trim());
}

/**
 * 編成取り込みデータテキスト変更時
 * @param {JQuery} $this
 */
function input_deck_Changed($this) {
	// 入力検証　0文字はアウト
	const input = $this.val().trim();
	const $btn = $this.closest('.modal-body').find('.btn_load_deck');
	if (input.length === 0) {
		$this.addClass('is-invalid').removeClass('is-valid');
		$this.nextAll('.invalid-feedback').text('データが入力されていません。');
		$btn.prop('disabled', true);
	}
	else {
		$this.removeClass('is-invalid');
		$btn.prop('disabled', false);
	}
}

/**
 * 共有データ文字列欄クリック時
 * @param {JQuery} $this
 */
function output_data_Clicked($this) {
	if (!$this.hasClass('is-valid')) return;
	if (copyInputTextToClipboard($this)) {
		inform_success('クリップボードにコピーしました。')
	}
}

/**
 * 共有データテキスト変更時
 * @param {JQuery} $this
 */
function output_data_Changed($this) {
	$this.removeClass('is-valid');
}

/**
 * 編成プリセット保存ボタンクリック
 */
function btn_commit_main_preset_Clicked() {
	const user = $('#upload_user').val().trim();
	const name = document.getElementById('input_preset_name').value.trim();
	if ($('#allow_upload_preset').prop('checked') && user.length > 20) {
		inform_warning('投稿者名は20文字以内で入力してください。');
		return;
	}
	if ($('#allow_upload_preset').prop('checked') && !name) {
		inform_warning('編成名を入力してください。');
		return;
	}

	// 新規登録 or 更新処理
	updateMainPreset();
}

/**
 * プリセットメモのみ変更処理
 */
function btn_commit_preset_memo_Clicked() {
	// 今現在のタブ情報
	const activePreset = getActivePreset();
	const presetid = activePreset.id;

	const presets = loadLocalStorage('presets') || [];

	const i = presets.findIndex(v => v[0] === presetid);
	if (i >= 0) {
		// 名称　メモを設定
		let newMemo = $('#preset_memo').val().trim();
		// 400文字超えてたら切る
		if (newMemo.length > 400) {
			newMemo = newMemo.slice(0, 400);
			$('#preset_memo').val(newMemo);
		}
		presets[i][3] = newMemo;

		saveLocalStorage('presets', presets);
		inform_success('編成メモの更新が完了しました。');
	}
	else {
		inform_success('編成メモの更新に失敗しました。');
	}
}

/**
 * プリセアップロード海域選択時
 */
function select_preset_category_Changed() {
	const area = castInt($('#select_preset_category').val());

	if (area > 400) {
		$('#select_preset_level').parent().removeClass('d-none');
		$('#select_preset_level').val(4);
	}
	else {
		$('#select_preset_level').parent().addClass('d-none');
	}
}

/**
 * アップロードする場合クリック
 */
function allow_upload_preset_Clicked() {
	if ($('#allow_upload_preset').prop('checked')) {
		$('#upload_option').removeClass('d-none');

		// アップロードのみボタン出現
		if ($('#modal_main_preset').find('.btn_commit_preset').hasClass('rename')) {
			$('#btn_upload_preset').removeClass('d-none');
		}
		else {
			$('#btn_upload_preset').addClass('d-none');
		}

		$('#upload_user').val(setting.uploadUserName);
	}
	else {
		$('#upload_option').addClass('d-none');
		$('#btn_upload_preset').addClass('d-none');
	}
}

/**
 * アップロードのみボタンクリック
 */
function btn_upload_preset_Clicked() {
	const user = $('#upload_user').val().trim();
	const name = document.getElementById('input_preset_name').value.trim();
	if (user.length > 20) {
		inform_warning('投稿者名は20文字以内で入力してください。');
		return;
	}
	if (!name) {
		inform_warning('編成名を入力してください。');
		return;
	}
	updateMainPreset(true);
}

/**
 * デッキビルダーデータ読み込みクリック
 */
function btn_load_deck_Clicked() {
	const inputData = $('#input_deck').val().trim();
	const preset = readDeckBuilder(inputData);

	if (preset) {
		expandMainPreset(preset, preset[0][0].length > 0, true, false);
		$('#input_deck').removeClass('is-invalid').addClass('is-valid');
		// 対空砲火を有効にする
		document.getElementById('adapt_stage2')['checked'] = true;

		if (showDeckSelector()) {
			inform_success('編成の反映に成功しました。');
		}

	}
	else {
		$('#input_deck').addClass('is-invalid').removeClass('is-valid');
		inform_danger('編成の読み込みに失敗しました。入力されたデータの形式が正しくない可能性があります。');
	}
}

/**
 * 共有リンク生成ボタンクリック
 */
async function btn_output_url_Clicked() {
	try {
		const $output = $('#output_url');
		const url = MYURL + '?d=' + encodePreset();
		let shortURL = url;
		let result = false;
		await postURLData(url)
			.then(json => {
				if (json.error || !json.shortLink) console.log(json);
				else {
					result = true;
					shortURL = json.shortLink;
				}
			})
			.catch(error => console.error(error));

		if (result) {
			$output.val(shortURL);
			$output.nextAll('.valid-feedback').text('生成しました。上記URLをクリックするとクリップボードにコピーされます。');
			$output.removeClass('is-invalid').addClass('is-valid');
		}
		else {
			$output.nextAll('.valid-feedback').text('生成に失敗しました。');
			$output.addClass('is-invalid').removeClass('is-valid');
		}
	} catch (error) {
		$('#output_url').addClass('is-invalid').removeClass('is-valid');
		return;
	}
}

/**
 * デッキビルダー形式生成ボタンクリック
 */
function btn_output_deck_Clicked() {
	const $output = $('#output_deck');
	$output.nextAll('.valid-feedback').text('');
	$output.removeClass('is-invalid').removeClass('is-valid');

	const fleet = createFriendFleetPreset();
	const landBase = createLandBasePreset();
	const withoutDisabledShip = document.getElementById('without_disabled_ship')['checked'];
	const dataString = convertToDeckBuilder(fleet, landBase, withoutDisabledShip);
	$('#output_deck').val(dataString);
	if (dataString) {
		$output.nextAll('.valid-feedback').text('生成しました。上記文字列をクリックするとクリップボードにコピーされます。');
		$output.removeClass('is-invalid').addClass('is-valid');
	}
	else $output.addClass('is-invalid').removeClass('is-valid');
}

/**
 * デッキビルダーサイト展開クリック
 */
function open_deckBuilder() {
	const fleet = createFriendFleetPreset();
	const landBase = createLandBasePreset();
	const withoutDisabledShip = document.getElementById('without_disabled_ship')['checked'];
	window.open('http://kancolle-calc.net/deckbuilder.html?predeck=' + convertToDeckBuilder(fleet, landBase, withoutDisabledShip));
}

/**
 * 作戦室展開クリック
 */
function open_Jervis() {
	const fleet = createFriendFleetPreset();
	const landBase = createLandBasePreset();
	const withoutDisabledShip = document.getElementById('without_disabled_ship')['checked'];
	window.open('https://kcjervis.github.io/jervis/?operation-json=' + convertToDeckBuilder_j(fleet, landBase, withoutDisabledShip));
}

/**
 * シミュ内タブクリック時
 * @param {JQuery} $this
 */
function simulatorTab_Clicked($this) {
	if ($this[0].dataset.presetid) {
		const activePresets = loadLocalStorage('activePresets');
		const preset = activePresets.presets.find(v => v.id === $this[0].dataset.presetid);
		if (preset) {
			const data = preset.history.histories[preset.history.index];
			expandMainPreset(decodePreset(data));
			calculate();
		}
	}
	else {
		// 見つからなかった場合新規タブ
		let tabData = {
			id: getUniqueId(),
			name: getMaxUntitled(),
			// 全て空のデータ ↓
			history: {
				index: 0,
				histories: ['Noi6BpgWgRnX4wtOC2o6ZzgAZL6HhG4QBEZ4ccpEcAZgIYA2AzgKaR7E8kQDMxLEA']
			},
			memo: ''
		};
		let activePresets = loadLocalStorage('activePresets');
		if (!activePresets) activePresets = { activeId: "", presets: [] };
		activePresets.presets.push(tabData);
		activePresets.activeId = tabData.id;
		saveLocalStorage('activePresets', activePresets);

		// ツールチップがあれば一掃する
		$('#fleet_tab_container .fleet_tab').tooltip('hide');
		$('#fleet_tab_container .fleet_tab').tooltip('dispose');

		setTab();
		expandMainPreset(decodePreset(tabData.history.histories[0]));
		calculate();
	}
}

/**
 * シミュ内アクティブなタブクリック時
 * @param {JQuery} $this
 */
function simulatorActiveTab_Clicked($this) {
	if ($this[0].dataset.presetid) {
		const activePresets = loadLocalStorage('activePresets');
		const preset = activePresets.presets.find(v => v.id === $this[0].dataset.presetid);
		if (preset) {
			// 編集開始
			$this.addClass('editting');
			$this.find('.fleet_name').addClass('d-none');
			$this.find('.fleet_name_input').removeClass('d-none');
			$this.find('.fleet_name_input').select();
		}
	}
}

/**
 * タブの入力欄からフォーカスアウトしたとき -> 編成名変更す
 * @param {JQuery} $this
 */
function fleet_name_input_Changed($this) {
	const $tab = $this.closest('.fleet_tab');
	const presetid = $tab[0].dataset.presetid;
	const presets = loadLocalStorage('presets') || [];

	$tab.removeClass('editting');
	$tab.find('.fleet_name').removeClass('d-none');
	$tab.find('.fleet_name_input').addClass('d-none');

	const i = presets.findIndex(v => v[0] === presetid);
	if (i >= 0) {
		let newName = $this.val().trim();
		if (newName && presets[i][1] !== newName) {

			// 50文字超えてたら切る
			if (newName.length > 50) {
				newName = newName.slice(0, 50);
				$this.val(newName);
			}

			presets[i][1] = newName;
			$tab.find('.fleet_name').text(newName);
			saveLocalStorage('presets', presets);
			inform_success('編成名が更新されました。');
		}
	}
	else {
		// 一時保存枠から検索
		const activePreset = getActivePreset();
		let newName = $this.val().trim();
		if (newName && activePreset) {

			// 50文字超えてたら切る
			if (newName.length > 50) {
				newName = newName.slice(0, 50);
				$this.val(newName);
			}
			// タブ情報の更新
			activePreset.name = newName;
			updateActivePreset(activePreset);
			setTab();
			inform_success('編成名が更新されました。');
		}
		else {
			inform_warning('編成名称変更に失敗しました。');
		}
	}
}

/**
 * 取り込み編成選択画面表示
 */
function showDeckSelector() {
	if (loadedDeckBuilders && loadedDeckBuilders.length <= 2) {
		return true;
	}

	const fragment = document.createDocumentFragment();
	for (let i = 0; i < loadedDeckBuilders.length; i++) {
		const fleetNo = loadedDeckBuilders[i][0];
		const fleet = loadedDeckBuilders[i][1];

		const fleetRow = createDiv('fleet_selectable general_tr m-1 p-2');
		if (fleetNo < 2) {
			fleetRow.classList.add('selected');
		}
		if (loadedDeckBuilders.length >= 3 && fleetNo >= 2) {
			fleetRow.classList.add('disabled');
		}
		fleetRow.dataset.dataIndex = i;
		const header = createDiv('deck_header ml-1 d-flex');

		const checkBox = createDiv('align-self-center');
		checkBox.innerHTML = `<i class="fas fa-checkbox-unchecked"></i><i class="fas fa-checkbox-checked"></i>`;
		header.appendChild(checkBox);

		const fleetNoDiv = createDiv('ml-2 align-self-center');
		fleetNoDiv.textContent = `第${fleetNo + 1}艦隊`;
		header.appendChild(fleetNoDiv);
		fleetRow.appendChild(header);

		const bodyDiv = createDiv('d-flex flex-wrap mt-1');
		for (let j = 0; j < fleet.length; j++) {
			const ship = fleet[j];
			if (ship[0] > 0) {
				const ship_img = document.createElement('img');
				ship_img.className = 'ship_image';
				ship_img.width = 100;
				ship_img.height = 25;
				ship_img.src = `../img/ship/${ship[0]}.png`;
				bodyDiv.appendChild(ship_img);
			}
		}
		fleetRow.appendChild(bodyDiv);
		fragment.appendChild(fleetRow);
	}

	document.getElementById('deck_list').innerHTML = '';
	document.getElementById('deck_list').appendChild(fragment);

	document.getElementById('btn_include_deck')['disabled'] = false;
	$('#modal_include_selector').modal('show');

	return false;
}

/**
 * タブの入力欄からフォーカスアウトしたとき -> 編成名変更す
 * @param {JQuery} $this
 */
function fleet_selectable_Clicked($this) {
	let $selected = $('.fleet_selectable.selected');

	if ($this.hasClass('selected')) {
		$this.removeClass('selected');
		$('.fleet_selectable.disabled').removeClass('disabled');
	}
	else if ($selected.length < 2) {
		$this.addClass('selected');
	}

	// 再度選択個数判定
	$selected = $('.fleet_selectable.selected');
	document.getElementById('btn_include_deck')['disabled'] = $selected.length === 0 || $selected.length > 2;

	// もう選択できないっぽくする
	if ($selected.length >= 2) {
		$('.fleet_selectable:not(.selected)').addClass('disabled');
	}
}

/**
 * 選択されているデッキを取り込む
 */
function btn_include_deck_Clicked() {
	const deck = [];
	let fleetNo = 0;
	$('.fleet_selectable.selected').each((i, e) => {
		const index = castInt(e.dataset.dataIndex, -1);
		if (index >= 0 && index < loadedDeckBuilders.length) {
			const data = loadedDeckBuilders[index];
			const ships = data[1];
			const isUgeki = ships.length && ships[0].length >= 5 && ships[0][6] === 2
			const start = (isUgeki ? 7 : 6) * fleetNo++;
			// 配属位置を置き換える 単純に連番でIKEYA
			for (let j = 0; j < ships.length; j++) {
				// 艦隊: [0:id, 1: Item配列, 2: 配属位置, 3:無効フラグ, 4:練度, 5:連合フラグ, 6:運]
				const ship = ships[j];
				ship[2] = start + j;
				deck.push(ship);
			}
		}
	});

	expandMainPreset([[], deck, []], false, true, false);
	calculate(false, true, false);

	inform_success('選択された編成データを取り込みました。');
	$('#modal_include_selector').modal('hide');
}

/*==================================
		資料室関連
==================================*/
/**
 * 初期化
 */
function initializeReference() {
	// 対空射撃機体
	createAvoidPlaneTable();

	// 対空値ランキング
	createAirPowerRanking();
	createDefenceRanking();

	// 練度上昇
	createRecoverPlaneTable();

	// 敵艦のランキング
	createFuckingEnemiesRanking();
}

/**
 * 射撃回避持ち機体一覧
 */
function createAvoidPlaneTable() {
	const fragment = document.createDocumentFragment();
	const planes = ITEM_DATA.filter(v => v.avoid > 0);
	planes.sort((a, b) => {
		if (a.type === b.type) {
			return a.avoid - b.avoid;
		}
		else {
			return a.type - b.type;
		}
	});

	for (const plane of planes) {
		if (plane.avoid) {
			const avoid = AVOID_TYPE.find(v => v.id === plane.avoid);
			const tr = document.createElement('tr');

			const td1 = document.createElement('td');
			td1.className = 'text-left';
			td1.innerHTML = `<img class="plane_img_sm" src="../img/type/icon${plane.itype}.png">
				<span class="ml-1">${plane.name}</span>`;
			tr.appendChild(td1);

			const td2 = document.createElement('td');
			td2.textContent = avoid.name;
			td2.className = 'text-center'
			tr.appendChild(td2);

			const td3 = document.createElement('td');
			td3.textContent = avoid.adj[0];
			tr.appendChild(td3);

			const td4 = document.createElement('td');
			td4.textContent = avoid.adj[1];
			tr.appendChild(td4);

			const td5 = document.createElement('td');
			td5.innerHTML = `<a href="${encodeWikiURL(plane.name)}" target="_blank">wiki</a>`;
			td5.className = 'text-center';
			tr.appendChild(td5);


			fragment.appendChild(tr);
		}
	}
	document.getElementById('avoid_plane_table_tbody').innerHTML = '';
	document.getElementById('avoid_plane_table_tbody').appendChild(fragment);
}

/**
 * 対空値ランキング - 通常
 */
function createAirPowerRanking() {
	// 所持装備でやるオプション
	const stockOnly = document.getElementById('anti_air_ranking_normal_registed')['checked'];
	const stockPlanes = loadPlaneStock();
	const planes = ITEM_DATA.filter(v => v.antiAir > 0 || v.antiBomber > 0 || v.interception > 0);
	/** @type {LandBaseItem[]} */
	let planes2 = [];
	for (const plane of planes) {
		if (!PLANE_TYPE.includes(plane.type)) continue;

		if (stockOnly) {
			const stockPlane = stockPlanes.find(v => v.id === plane.id);
			if (!stockPlane || getArraySum(stockPlane.num) < 1) continue;
			for (let remodel = 0; remodel <= 10; remodel++) {
				if (stockPlane.num[remodel]) {
					const p = new LandBaseItem(plane.id, 18, remodel, 7);
					// ランキング判定がだるいので実対空値の小数第2位を切り捨て
					p.actualAntiAir = Math.floor(p.actualAntiAir * 10) / 10;
					if (p.actualAntiAir >= 3) {
						planes2.push(p);
					}
				}
			}
		}
		else {
			const ins = new LandBaseItem(plane.id, 18, 0, 7);
			if (ins.actualAntiAir >= 3) {
				planes2.push(ins);
			}
		}
	}

	planes2.sort((a, b) => {
		if (b.airPower !== a.airPower) return b.airPower - a.airPower;
		else if (b.actualAntiAir !== a.actualAntiAir) return b.actualAntiAir - a.actualAntiAir;
		return b.radius - a.radius;
	});

	const fragment = document.createDocumentFragment();
	let rank = 1;

	const ranks = [];
	const maxAp = getArrayMax(planes2.map(v => v.airPower));

	// 順位とタイの個数計算
	for (let ap = maxAp; ap > 0; ap--) {
		const hit = planes2.filter(v => v.airPower === ap).length;
		if (hit > 0) {
			ranks.push({ rank: rank++, airPower: ap, count: hit });
		}
	}

	rank = 1;
	for (const obj of ranks) {
		const rankerPlanes = planes2.filter(v => v.airPower === obj.airPower);
		for (let i = 0; i < rankerPlanes.length; i++) {
			const plane = rankerPlanes[i];
			const planeNames = `
				<div class="d-flex">
				<img class="align-self-center plane_img_sm" src="../img/type/icon${plane.itype}.png">
				<div class="align-self-center ml-1">${plane.name}</div>
					${(plane.remodel ? '<div class="align-self-center text_remodel font_size_12 ml-1"><i class="fas fa-star"></i>+' + plane.remodel + '</div>' : '')}
				</div>`;

			const tr = document.createElement('tr');
			tr.innerHTML = `
				${i === 0 ? `<td class="text-center" rowspan="${obj.count}">${rank}位</td>` : ''}
				<td class="text-left">${planeNames}</td>
				<td>${plane.radius}</td>
				${i === 0 ? `<td rowspan="${obj.count}">${plane.actualAntiAir}</td>` : ''}
				${i === 0 ? `<td rowspan="${obj.count}">${plane.airPower}</td>` : ''}
				<td class="text-center"><a href="${encodeWikiURL(plane.name)}" target="_blank">wiki</a></td>`;

			fragment.appendChild(tr);
			rank++;
		}
	}

	document.getElementById('plane_aa_ranking_table_tbody').innerHTML = '';
	document.getElementById('plane_aa_ranking_table_tbody').appendChild(fragment);
}


/**
 * 対空値ランキング - 防空
 */
function createDefenceRanking() {
	// 所持装備でやるオプション
	const stockOnly = document.getElementById('anti_air_ranking_defense_registed')['checked'];
	const stockPlanes = loadPlaneStock();
	const planes = ITEM_DATA.filter(v => FIGHTERS.includes(v.type));
	let planes2 = [];
	for (const plane of planes) {
		if (stockOnly) {
			const stockPlane = stockPlanes.find(v => v.id === plane.id);
			if (!stockPlane || getArraySum(stockPlane.num) < 1) continue;
			for (let remodel = 0; remodel <= 10; remodel++) {
				if (stockPlane.num[remodel]) {
					const p = new LandBaseItem(plane.id, 18, remodel, 7);
					planes2.push(p);
				}
			}
		}
		else {
			const p = new LandBaseItem(plane.id, 18, 0, 7);
			planes2.push(p);
		}
	}

	planes2.sort((a, b) => {
		if (b.defenseAirPower !== a.defenseAirPower) return b.defenseAirPower - a.defenseAirPower;
		return b.antiBomber - a.antiBomber;
	});
	let rank = 1;
	const ranks = [];

	// 順位とタイの個数計算
	for (let airPower = 300; airPower > 0; airPower--) {
		const hit = planes2.filter(v => v.defenseAirPower === airPower).length;
		if (hit > 0) {
			ranks.push({ rank: rank++, defenseAirPower: airPower, count: hit });
		}
	}

	const fragment = document.createDocumentFragment();
	rank = 1
	for (const obj of ranks) {
		const rankerPlanes = planes2.filter(v => v.defenseAirPower === obj.defenseAirPower);
		for (let i = 0; i < rankerPlanes.length; i++) {
			const plane = rankerPlanes[i];
			const planeNames = `
      <div class="d-flex">
        <img class="align-self-center plane_img_sm" src="../img/type/icon${plane.itype}.png">
        <div class="align-self-center ml-1 ${ROCKETS.includes(plane.id) ? 'special_item' : ''}">${plane.name}</div>
        ${(plane.remodel ? '<div class="align-self-center text_remodel font_size_12 ml-1"><i class="fas fa-star"></i>+' + plane.remodel + '</div>' : '')}
      </div>`;

			const tr = document.createElement('tr');
			tr.innerHTML = `
				${i === 0 ? `<td class="text-center" rowspan="${obj.count}">${rank}位</td>` : ''}
				<td class="text-left">${planeNames}</td>
				<td>${plane.antiBomber}</td>
				${i === 0 ? `<td rowspan="${obj.count}">${plane.antiAir + plane.interception + 2.0 * plane.antiBomber}</td>` : ''}
				${i === 0 ? `<td rowspan="${obj.count}">${plane.defenseAirPower}</td>` : ''}
				<td class="text-center"><a href="${encodeWikiURL(plane.name)}" target="_blank">wiki</a></td>`;
			fragment.appendChild(tr);
			rank++;
		}
	}

	document.getElementById('plane_defense_ranking_table_tbody').innerHTML = '';
	document.getElementById('plane_defense_ranking_table_tbody').appendChild(fragment);
}

/**
 * 対空砲火ランキング(敵)
 */
function createFuckingEnemiesRanking() {
	if (document.getElementById('fucking_enemie_table_tbody').innerHTML) {
		return;
	}

	const enemies = ENEMY_DATA.map(v => {
		const battle = new Battle();
		battle.enemies = [new Enemy(v.id)];
		battle.createStage2Table();
		return battle;
	});
	enemies.sort((a, b) => {
		const aFix = a.stage2[0][1][0];
		const bFix = b.stage2[0][1][0];
		if (aFix !== bFix) return bFix - aFix;

		const aBonus = a.enemies[0].antiAirBonus;
		const bBonus = b.enemies[0].antiAirBonus;
		if (aBonus !== bBonus) return bBonus - aBonus;

		const aRate = a.stage2[0][0][0];
		const bRate = b.stage2[0][0][0];
		if (aRate !== bRate) return bRate - aRate;

		return b.enemies[0].id - a.enemies[0].id;
	});

	const fragment = document.createDocumentFragment();
	const fragment2 = document.createDocumentFragment();
	let rank = 1;
	for (const enemy of enemies) {
		const enemiId = enemy.enemies[0].id;
		const hasAntiAirCI = ANTIAIR_CUTIN_ENEMY.includes(enemiId);
		const tr = document.createElement('tr');

		const td1 = document.createElement('td');
		td1.className = 'text-center';
		td1.textContent = rank + '位';

		const td2 = document.createElement('td');
		td2.dataset.enemyid = enemiId;
		td2.className = 'text-left enemy_info_tr';
		td2.innerHTML = `
		<div class="d-flex">
			<div class="align-self-center"><img class="enemy_name_img" src="../img/enemy/${enemiId}.png"></div>
			<div class="ml-1 align-self-center">
				<div class="text-primary font_size_11">ID: ${1500 + enemiId}</div>
					<div class="${hasAntiAirCI ? 'special_item' : ''}">
						${drawEnemyGradeColor(enemy.enemies[0].name)}
					</div>
				</div>
		</div>`;

		const td3 = document.createElement('td');
		td3.textContent = enemy.stage2[0][1];

		const td4 = document.createElement('td');
		td4.textContent = (enemy.stage2[0][0] * 100).toFixed(1);

		const td5 = document.createElement('td');
		td5.textContent = enemy.enemies[0].antiAirBonus;

		const td6 = document.createElement('td');
		td6.textContent = enemy.enemies[0].antiAirWeight;

		tr.appendChild(td1);
		tr.appendChild(td2);
		tr.appendChild(td3);
		tr.appendChild(td4);
		tr.appendChild(td5);
		tr.appendChild(td6);
		if (rank < 100) {
			fragment.appendChild(tr);
		}
		else {
			fragment2.appendChild(tr);
		}
		rank++;
	}

	document.getElementById('fucking_enemie_table_tbody').innerHTML = '';
	document.getElementById('fucking_enemie_table_zako_tbody').innerHTML = '';
	document.getElementById('fucking_enemie_table_tbody').appendChild(fragment);
	document.getElementById('fucking_enemie_table_zako_tbody').appendChild(fragment2);
}

/**
 * 熟練度上昇速度機体一覧
 */
function createRecoverPlaneTable() {
	const fragment = document.createDocumentFragment();
	let planes = ITEM_DATA.filter(v => PLANE_TYPE.includes(v.type));
	if (!document.getElementById('recover_planes_fighter')['checked']) {
		planes = planes.filter(v => !FIGHTERS.includes(v.type));
	}
	if (!document.getElementById('recover_planes_attacker')['checked']) {
		planes = planes.filter(v => !ATTACKERS.includes(v.type));
	}
	if (!document.getElementById('recover_planes_scouter')['checked']) {
		planes = planes.filter(v => !RECONNAISSANCES.includes(v.type));
	}

	planes.sort((a, b) => {
		if (a.grow === b.grow) {
			return a.type - b.type;
		}
		return a.grow - b.grow;
	});

	const levels = [];
	for (let c = 15; c > 0; c--) {
		const group = planes.filter(v => v.grow === c);
		if (group.length) {
			levels.push({ c: c, planes: group });
		}
	}

	for (const data of levels) {
		for (let i = 0; i < data.planes.length; i++) {
			const plane = data.planes[i];
			const tr = document.createElement('tr');

			if (i === 0) {
				const td1 = document.createElement('td');
				td1.textContent = getRequiredgBattleCountString(data.c);
				td1.className = 'text-center';
				td1.rowSpan = data.planes.length;
				tr.appendChild(td1);
			}

			const td2 = document.createElement('td');
			td2.className = 'text-left';
			td2.innerHTML = `<img class="plane_img_sm" src="../img/type/icon${plane.itype}.png">
				<span class="ml-1">${plane.name}</span>`;
			tr.appendChild(td2);

			const td3 = document.createElement('td');
			td3.innerHTML = `<a href="${encodeWikiURL(plane.name)}" target="_blank">wiki</a>`;
			td3.className = 'text-center';
			tr.appendChild(td3);

			fragment.appendChild(tr);
		}
	}

	document.getElementById('recover_plane_table_tbody').innerHTML = '';
	document.getElementById('recover_plane_table_tbody').appendChild(fragment);
}

/**
 * wiki用URL変換
 * @param {*} planeName
 * @returns
 */
function encodeWikiURL(planeName) {
	if (planeName === '天山一二型(村田隊)') {
		planeName = '天山(村田隊)';
	}
	return WIKIURL + planeName.replace('/', '／').replace('+', '＋');
}

/*==================================
		イベントハンドラ
==================================*/
document.addEventListener('DOMContentLoaded', function () {
	// 画面初期化
	initialize(() => {

		// URLパラメータチェック
		const params = getUrlParams();
		let existURLData = false;
		if (params.hasOwnProperty("d")) {
			// URLから復元した (一般)
			expandMainPreset(decodePreset(params.d));
			existURLData = true;
		}
		else if (params.hasOwnProperty("predeck") || params.hasOwnProperty("lb")) {
			if (params.hasOwnProperty("predeck")) {
				// デッキビルダーー形式で読み込んだ
				const deck = readDeckBuilder(params.predeck);
				if (deck) {
					expandMainPreset(deck, deck[0][0].length > 0, true, false);
					// 対空砲火を有効にする
					document.getElementById('adapt_stage2')['checked'] = true;
				}
			}

			if (params.hasOwnProperty("lb")) {
				// 基地情報も読み込んだ
				try {
					const lbData = JSON.parse(decodeURIComponent(params.lb));
					if (lbData.length >= 2) {
						expandMainPreset([lbData, [], []], true, false, false);
					}
				}
				catch (error) {
					// 基地形式データおかしい場合…読み込まずそっとしておく
				}
			}

			existURLData = true;
		}
		else if (params.hasOwnProperty("p")) {
			// リストページから遷移
			expandMainPreset(decodePreset(params.p));
		}
		else {
			// URL情報に特に引っかからなければ、前回のactiveTabを読み込む（あれば）
			const prevData = getActivePreset();
			if (prevData.id) {
				try {
					expandMainPreset(decodePreset(prevData.history.histories[prevData.history.index]));
				} catch (error) {
					// 死を遂げたらタブ一掃してトップに飛ばす
					deleteLocalStorage('activePresets');
					window.location.href = '../list/';
					return;
				}
			}
			else {
				// 特に何もタブがない場合はlistにリダイレクト
				window.location.href = '../list/';
				return;
			}
		}

		if (existURLData) {
			// 外部編成データが読み込まれたため新しいタブを生成
			let tabData = {
				id: getUniqueId(),
				name: '外部データ',
				history: { index: 0, histories: [] },
				memo: ''
			};
			const activePresets = loadLocalStorage('activePresets') || { activeId: "", presets: [] };
			if (activePresets.presets.filter(v => v.name === '外部データ').length > 5 && Math.floor(Math.random() * 5) === 4) {
				tabData.name = 'おそとデータ';
			}
			activePresets.presets.push(tabData);
			activePresets.activeId = tabData.id;

			saveLocalStorage('activePresets', activePresets);

			setTab();
		}

		// specialOperator.update('A');
		calculate();
		showDeckSelector();
	});

	// イベント貼り付け
	$(document).keyup(function (e) { if (isCtrlPress && e.keyCode === 17) isCtrlPress = false; });
	$(document).keydown(function (e) {
		if (!isCtrlPress && e.keyCode === 17) isCtrlPress = true;
		if (isCtrlPress && e.key === "z") {
			btn_undo_Clicked();
		}
		else if (isCtrlPress && e.key === "y") {
			btn_redo_Clicked();
		}
	});
	// トップページへ
	document.getElementById('btn_top').addEventListener('click', () => { window.location.href = '../list/'; });
	$('#header').on('click', '.fleet_tab:not(.active)', function () { simulatorTab_Clicked($(this)); });
	$('#header').on('click', '.fleet_tab.active:not(.editting)', function () { simulatorActiveTab_Clicked($(this)); });
	$('#header').on('blur', '.fleet_name_input', function () { fleet_name_input_Changed($(this)); });
	$('.modal').on('hide.bs.modal', function () { modal_Closed($(this)); });
	$('.modal').on('show.bs.modal', function () { $('.btn_preset').tooltip('hide'); });
	$('.modal').on('click', '.toggle_display_type', function () { toggle_display_type_Clicked($(this)); });
	$('.modal').on('input', '.preset_name', function () { preset_name_Changed($(this)); });
	$('.modal').on('blur', '.preset_name', function () { preset_name_Changed($(this)); });
	$('.modal.sub_modal').on('hidden.bs.modal', function () { $(document.body).addClass('modal-open'); });
	$('.slot_select_parent').on('show.bs.dropdown', function () { slot_select_parent_Show($(this)); });
	$('.slot_select_parent').on('hide.bs.dropdown', function () { slot_select_parent_Close($(this)); });
	$('.remodel_select_parent').on('hide.bs.dropdown', function () { remodelSelect_Changed($(this)); });
	$('.remodel_select_parent').on('show.bs.dropdown', function () { remodelSelect_Shown($(this)); });
	$('.prof_select_parent').on('show.bs.dropdown', function () { profSelect_Shown($(this)); });
	$('#main').on('show.bs.collapse', '.collapse', function () { $(this).prev().find('.fa-chevron-up').removeClass('fa-chevron-up').addClass('fa-chevron-down'); });
	$('#main').on('hide.bs.collapse', '.collapse', function () { $(this).prev().find('.fa-chevron-down').removeClass('fa-chevron-down').addClass('fa-chevron-up'); });
	$('#main').on('shown.bs.collapse', '.collapse', function () { $(this).removeClass('tmpHide'); });
	$('#main').on('focus', '.slot_input', function () { $(this).select(); });
	$('#main').on('input', '.slot_input', function () { slot_input_Changed($(this)); });
	$('#main').on('input', '.slot_range', function () { slot_range_Changed($(this)); });
	$('#main').on('click', '.remodel_item', function () { $(this).addClass('remodel_item_selected'); });
	$('#main').on('click', '.btn_plane_preset', function () { btn_plane_preset_Clicked($(this)); });
	$('#main').on('click', '.btn_capture', function () { btn_capture_Clicked($(this)); });
	$('#main').on('click', '.btn_reset_content', function () { btn_reset_content_Clicked($(this)); });
	$('#main').on('click', '.btn_content_trade', function () { btn_content_trade_Clicked($(this)); });
	$('#main').on('click', '.btn_commit_trade', commit_content_order);
	$('#main').on('click', '.btn_ex_setting', function () { btn_ex_setting_Clicked($(this)); });
	$('#main').on('click', '.btn_lb_target', btn_lb_target_Clicked);
	$('#main').on('click', '.lb_target_button', btn_lb_target_Clicked);
	$('#main_header_info').on('click', 'input', function () { display_special_Changed($(this)); });
	$('#site_warning').on('click', '.cur_pointer', () => { $('#site_warning').removeClass('d-flex').addClass('d-none'); });
	$('#landBase').on('click', '.btn_air_raid', btn_air_raid_Clicked);
	$('#landBase').on('click', '#alert_air_raid_button', btn_air_raid_Clicked);
	$('#landBase').on('click', '.btn_supply', btn_supply_Clicked);
	$('#landBase_content').on('change', '.ohuda_select', function () { calculate(true, false, false); });
	$('#landBase_content').on('click', '.btn_remove_plane', function () { btn_remove_lb_plane_Clicked($(this)); });
	$('#landBase_content').on('click', '.btn_reset_landBase', function () { btn_reset_landBase_Clicked($(this)); });
	$('#landBase_content').on('click', '.prof_item', function () { proficiency_Changed($(this)); });
	$('#landBase_content').on('click', '.btn_show_contact_rate_lb', function () { btn_show_contact_rate_lb_Clicked($(this)); });
	$('#landBase_content').on('click', '.btn_toggle_lb_info', function () { btn_toggle_lb_info_Clicked($(this)); });
	$('#landBase_content').on('click', '#toggle_def_mode', toggle_def_mode_Checked);
	$('#landBase_content').on('click', '.simple_lb_progress', function () { simple_lb_progress_Clicked($(this)) });
	$('#landBase_content').on('click', '.plane_name', function () { plane_name_Clicked($(this)); });
	$('#landBase_content').on('touchend', '.plane_name', function () { plane_name_Clicked($(this)); });
	$('#friendFleet_content').on('click', '.plane_name', function () { plane_name_Clicked($(this)); });
	$('#friendFleet_content').on('touchend', '.plane_name', function () { plane_name_Clicked($(this)); });
	$('#friendFleet_content').on('click', '.btn_ship_create', function () { btn_ship_create_Clicked($(this)); });
	$('#friendFleet_content').on('click', '.btn_reset_ship_plane', function () { btn_reset_ship_plane_Clicked($(this)); });
	$('#friendFleet_content').on('click', '.ship_name_span', function () { ship_name_span_Clicked($(this)); });
	$('#friendFleet_content').on('click', '.btn_remove_ship', function () { btn_remove_ship_Clicked($(this)); });
	$('#friendFleet_content').on('click', '.btn_remove_plane', function () { btn_remove_ship_plane_Clicked($(this)); });
	$('#friendFleet_content').on({ mouseenter: function () { $(this).closest('.ship_tab').find('.remove_line').addClass('ready'); }, mouseleave: function () { $(this).closest('.ship_tab').find('.remove_line').removeClass('ready'); }, }, '.btn_reset_ship_plane');
	$('#friendFleet_content').on('click', '.prof_item', function () { proficiency_Changed($(this)); });
	$('#friendFleet_content').on('click', '.btn_ship_toggle', function () { btn_ship_toggle_Clicked($(this)); });
	$('#friendFleet_content').on('click', '.ship_disabled', function () { ship_disabled_Changed($(this)); });
	$('#friendFleet_content').on('click', '#union_fleet', union_fleet_Checked);
	$('#friendFleet_content').on('click', '#yugeki_fleet', yugeki_fleet_Checked);
	$('#friendFleet_content').on('click', '#visible_anti_air_status', visible_anti_air_status_Clicked);
	$('#friendFleet_content .nav-link[data-toggle="tab"]').on('shown.bs.tab', fleet_select_tab_Clicked);
	$('#friendFleet_content').on('click', '.plane_lock', function () { plane_lock_Clicked($(this)); });
	$('#friendFleet_content').on('click', '.plane_unlock', function () { plane_unlock_Clicked($(this)); });
	$('#friendFleet_content').on('click', '.slot_ini', function () { slot_ini_Clicked($(this)); });
	$('#friendFleet_content').on('click', '.btn_show_contact_rate', function () { btn_show_contact_rate_Clicked(); });
	$('#friendFleet_content').on('click', '.btn_antiair_input', btn_antiair_input_Clicked);
	$('#friendFleet_content').on('click', '.form_ship_level', function () { form_ship_level_Clicked($(this)); });
	$('#friendFleet_content').on('click', '.form_ship_luck', function () { form_ship_luck_Clicked($(this)); });
	$('#friendFleet_content').on('input', '#admin_lv', admin_lv_Changed);
	$('#enemyFleet_content').on('change', '.cell_type', function () { cell_type_Changed($(this)); });
	$('#enemyFleet_content').on('change', '.formation', function () { calculate(false, false, true); });
	$('#enemyFleet_content').on('click', '.enemy_index', function () { enemy_index_Clicked($(this)); });
	$('#enemyFleet_content').on('click', '.enemy_name', function () { enemy_name_Clicked($(this)); });
	$('#enemyFleet_content').on('click', '.btn_reset_battle', function () { btn_reset_battle_Clicked($(this)); });
	$('#enemyFleet_content').on('click', '#btn_world_expand', btn_world_expand_Clicked);
	$('#enemyFleet_content').on('click', '.btn_enemy_preset', function () { btn_enemy_preset_Clicked($(this)); });
	$('#enemyFleet_content').on('click', '.btn_stage2', function () { btn_stage2_Clicked($(this)); });
	$('#enemyFleet_content').on('change', '#battle_count', function () { battle_count_Changed($(this)); });
	$('#enemyFleet_content').on('click', 'input[name="enemy_fleet_display_mode"]', function () { enemy_fleet_display_mode_Changed($(this)); });
	$('#result').on('click', '#btn_calculate', function () { calculate(false, false, false); });
	$('#result_content').on('click', '#btn_more_calc', btn_more_calc_Clicked);
	$('#result_content').on('click', '#display_battle_tab .nav-item', function () { display_battle_tab_Changed($(this)); });
	$('#result_content').on('click', '#empty_slot_invisible', function () { calculate(false, false, false); });
	$('#result_content').on('click', '#display_setting .custom-check', display_result_Changed);
	$('#result_content').on('click', '#shoot_down_table_tbody tr', function () { fleet_slot_Clicked($(this)); });
	$('#result_content').on('click', '#rate_table .land_base_detail', function () { land_base_detail_Clicked($(this)); });
	$('#result_content').on('click', '#result_bar .progress_area', function () { land_base_bar_Clicked($(this)); });
	$('#result_content').on('click', '#enemy_shoot_down_tbody .td_detail_slot', function () { enemy_slot_Clicked($(this)); });
	$('#result_content').on('click', '.btn_antiair_input', btn_antiair_input_Clicked);
	$('#result_content').on('click', '#adapt_stage2', function () { calculate(false, true, false); });
	$('#result_content').on('change', '#fleet_formation', function () { calculate(false, false, false); });
	$('#config_content').on('focus', '#calculate_count', function () { $(this).select(); });
	$('#config_content').on('input', '#calculate_count', function () { calculate_count_Changed($(this)); });
	$('#config_content').on('click', '#innerProfSetting .custom-check', function () { innerProfSetting_Clicked($(this)); });
	$('#config_content').on('click', '#clipboard_mode', clipboard_mode_Clicked);
	$('#config_content').on('click', '.dropdown-item', function () { init_proficiency_Changed($(this)); });
	$('#config_content').on('click', '#btn_reset_selected_plane_history', btn_reset_selected_plane_history_Clicked);
	$('#config_content').on('click', '#btn_reset_selected_ship_history', btn_reset_selected_ship_history_Clicked);
	$('#ship_stock').on('click', '.stock_td_fav', function (e) { ship_stock_td_fav_Clicked($(this)); e.stopPropagation(); });
	$('#plane_stock').on('click', '.stock_td_fav', function (e) { stock_td_fav_Clicked($(this)); e.stopPropagation(); });
	$('#manage_manual_data').on('show.bs.collapse', '.collapse', manage_manual_enemu_content_Shown);
	$('#manage_manual_data').on('click', '.manual_enemy_tr', function () { manul_enemy_Clicked($(this)); });
	$('#modal_plane_select').on('click', '.plane', function () { modal_plane_Selected($(this)); });
	$('#modal_plane_select').on('click', '.btn_remove', function () { modal_plane_select_btn_remove_Clicked($(this)); });
	$('#modal_plane_select').on('click', '#plane_type_select .item_type', function () { plane_type_select_Changed($(this)) });
	$('#modal_plane_select').on('click', '#fav_only', fav_only_Checked_Chenged);
	$('#modal_plane_select').on('click', '#disp_in_stock', disp_in_stock_Checked_Chenged);
	$('#modal_plane_select').on('click', '#divide_stock', divide_stock_Checked_Chenged);
	$('#modal_plane_select').on('click', '#disp_equipped', disp_equipped_Checked_Chenged);
	$('#modal_plane_select').on('click', '#disp_special', function () { plane_type_select_Changed(); });
	$('#modal_plane_select').on('input', '#plane_word', plane_word_TextChanged);
	$('#modal_plane_select').on('change', '#plane_sort_select', function () { sort_Changed($(this)); });
	$('#modal_plane_select').on('change', '#plane_filter_key_select', plane_filter_Changed);
	$('#modal_plane_select').on('change', '#plane_filter_value', plane_filter_Changed);
	$('#modal_plane_select').on('click', '.toggle_display_type', function () { plane_type_select_Changed(); });
	$('#modal_plane_select').on('click', '#plane_table_thead .sortable_td', function () { sortable_td_Clicked($(this)); });
	$('#modal_plane_preset').on('click', '.preset_tr', function () { plane_preset_tr_Clicked($(this)); });
	$('#modal_plane_preset').on('click', '.btn_commit_preset', function () { btn_commit_plane_preset_Clicked($(this)); });
	$('#modal_plane_preset').on('click', '.btn_delete_preset', function () { btn_delete_plane_preset_Clicked($(this)); });
	$('#modal_plane_preset').on('click', '.btn_expand_preset', btn_expand_plane_preset_Clicked);
	$('#modal_ship_select').on('click', '.ship_tr:not(.ship_tr_disabled)', function () { modal_ship_Selected($(this)); });
	$('#modal_ship_select').on('click', '.btn_remove', function () { modal_ship_select_btn_remove_Clicked($(this)); });
	$('#modal_ship_select').on('click', '#display_final', createShipTable);
	$('#modal_ship_select').on('click', '#frequent_ship', createShipTable);
	$('#modal_ship_select').on('click', '#fav_only_ship', createShipTable);
	$('#modal_ship_select').on('click', '#disp_in_stock_ship', createShipTable);
	$('#modal_ship_select').on('click', '#disp_equipped_ship', createShipTable);
	$('#modal_ship_select').on('click', '#disp_daihatsu_ship', createShipTable);
	$('#modal_ship_select').on('click', '#disp_kamisha_ship', createShipTable);
	$('#modal_ship_select').on('click', '#disp_slot_ex_ship', createShipTable);
	$('#modal_ship_select').on('click', '#ship_type_select .ship_type', function () { ship_type_select_Changed($(this)) });
	$('#modal_ship_select').on('click', '.toggle_display_type', createShipTable);
	$('#modal_ship_select').on('input', '#ship_word', ship_word_TextChanged);
	$('#modal_enemy_select').on('click', '.modal-body .enemy', function () { modal_enemy_Selected($(this)); });
	$('#modal_enemy_select').on('click', '.btn_remove', function () { modal_enemy_select_btn_remove($(this)); });
	$('#modal_enemy_select').on('click', '.toggle_display_type', createEnemyTable);
	$('#modal_enemy_select').on('change', '#enemy_type_select', createEnemyTable);
	$('#modal_enemy_select').on('input', '#enemy_word', enemy_word_TextChanged);
	$('#modal_enemy_pattern').on('show.bs.modal', modal_enemy_pattern_Shown);
	$('#modal_enemy_pattern').on('click', '.node_tr', function () { node_tr_Clicked($(this)); });
	$('#modal_enemy_pattern').on('click', '#btn_zoom_map', btn_zoom_map_Clicked);
	$('#modal_enemy_pattern').on('change', '#map_select', createNodeSelect);
	$('#modal_enemy_pattern').on('change', '#node_select', createEnemyPattern);
	$('#modal_enemy_pattern').on('change', '#select_difficulty', createNodeSelect);
	$('#modal_enemy_pattern').on('click', '#btn_expand_enemies', btn_expand_enemies);
	$('#modal_enemy_pattern').on('click', '#btn_continue_expand', btn_continue_expand_Clicked);
	$('#modal_enemy_pattern').on('click', '.node', function () { node_Clicked($(this)) });
	$('#modal_enemy_pattern').on('click', '#enemy_pattern_select .nav-link:not(.active)', function () { pattern_Changed($(this)) });
	$('#modal_enemy_pattern').on('click', 'input[name="enemy_display_mode"]', function () { enemy_display_mode_Changed($(this)) });
	$('#modal_enemy_pattern').on('dblclick', '.node', node_DoubleClicked);
	$('#modal_enemy_pattern').on('dblclick', '.node_tr', node_DoubleClicked);
	$('#modal_enemy_pattern').on('dblclick', '#enemy_pattern_select .nav-link.active', node_DoubleClicked);
	$('#modal_main_preset').on('show.bs.modal', modal_main_preset_Shown);
	$('#modal_main_preset').on('change', '#select_preset_category', select_preset_category_Changed);
	$('#modal_main_preset').on('click', '.btn_commit_preset', btn_commit_main_preset_Clicked);
	$('#modal_main_preset').on('click', '#allow_upload_preset', allow_upload_preset_Clicked);
	$('#modal_main_preset').on('click', '#btn_upload_preset', btn_upload_preset_Clicked);
	$('#modal_main_preset').on('input', '#input_preset_name', function () { preset_name_Changed($(this)); });
	$('#modal_main_preset').on('input', '#preset_remarks', function () { preset_remarks_Changed($(this)); });
	$('#modal_share').on('click', '.btn_load_deck', btn_load_deck_Clicked);
	$('#modal_share').on('input', '#input_deck', function () { input_deck_Changed($(this)); });
	$('#modal_share').on('focus', '#input_deck', function () { $(this).select(); });
	$('#modal_share').on('click', '.btn_output_url', btn_output_url_Clicked);
	$('#modal_share').on('click', '.btn_output_deck', btn_output_deck_Clicked);
	$('#modal_share').on('focus', '#output_url', function () { $(this).select(); });
	$('#modal_share').on('focus', '#output_deck', function () { $(this).select(); });
	$('#modal_share').on('input', '#output_url', function () { output_data_Changed($(this)); });
	$('#modal_share').on('input', '#output_deck', function () { output_data_Changed($(this)); });
	$('#modal_share').on('click', '#output_url', function () { output_data_Clicked($(this)); });
	$('#modal_share').on('click', '#output_deck', function () { output_data_Clicked($(this)); });
	$('#modal_share').on('click', '#open_deckBuilder', open_deckBuilder);
	$('#modal_share').on('click', '#open_jervis', open_Jervis);
	$('#modal_result_detail').on('click', '#btn_calculate_detail', btn_calculate_detail);
	$('#modal_result_detail').on('change', '#detail_calculate_count', () => $('#btn_calculate_detail').prop('disabled', false));
	$('#modal_result_detail').on('change', '.custom-radio', btn_calculate_detail);
	$('#modal_result_detail').on('change', '#target_enemy', btn_calculate_detail);
	$('#modal_result_detail').on('change', '#enabled_manual_stage2', btn_calculate_detail);
	$('#modal_result_detail').on('change', '#aa_cutin_miss', btn_calculate_detail);
	$('#modal_result_detail').on('click', '#critical_hit', stage3PowerCalculate);
	$('#modal_result_detail').on('click', '#stage3_all_slot', stage3PowerCalculate);
	$('#modal_result_detail').on('click', '#enabled_rikutei', stage3PowerCalculate);
	$('#modal_result_detail').on('click', '#enabled_rikutei_z', stage3PowerCalculate);
	$('#modal_result_detail').on('click', '#manual_enemy_union', stage3PowerCalculate);
	$('#modal_result_detail').on('click', '#manual_union_main', stage3PowerCalculate);
	$('#modal_result_detail').on('click', '#manual_union_escort', stage3PowerCalculate);
	$('#modal_result_detail').on('click', '#btn_apply_search', stage3PowerCalculate);
	$('#modal_result_detail').on('click', '#hp_1', stage3PowerCalculate);
	$('#modal_result_detail').on('click', '#hp_2', stage3PowerCalculate);
	$('#modal_result_detail').on('click', '#jet_phase', stage3PowerCalculate);
	$('#modal_result_detail').on('change', '#contact_bonus', stage3PowerCalculate);
	$('#modal_result_detail').on('change', '#ammo_bonus', stage3PowerCalculate);
	$('#modal_result_detail').on('change', '#manual_enemy_type', manual_enemy_type_Changed);
	$('#modal_result_detail').on('change', '#manual_enemy_id', stage3PowerCalculate);
	$('#modal_result_detail').on('input', '#stage3_slot', stage3PowerCalculate);
	$('#modal_result_detail').on('input', '#ship_bonus', stage3PowerCalculate);
	$('#modal_result_detail').on('input', '#stage3_remodel', stage3PowerCalculate);
	$('#modal_result_detail').on('focus', 'input[type="number"]:not([readonly])', function () { $(this).select(); });
	$('#modal_result_detail').on('click', '#show_detail_slot .nav-item', function () { detail_slot_tab_Changed($(this)); });
	$('#modal_result_detail').on('click', '.btn_show_detail:not(.disabled)', function () { btn_show_detail_Clicked($(this)); });
	$('#modal_result_detail').on('click', '#btn_output_slot_dist', btn_output_slot_dist_Clicked);
	$('#modal_result_detail').on('click', '#btn_output_slot_dist_table', btn_output_slot_dist_table_Clicked);
	$('#modal_collectively_setting').on('click', '.btn_remove_plane_all', function () { btn_remove_plane_all_Clicked($(this)); });
	$('#modal_collectively_setting').on('click', '.btn_remove_ship_all', btn_remove_ship_all_Clicked);
	$('#modal_collectively_setting').on('click', '.btn_slot_max', function () { btn_slot_max_Clicked($(this)); });
	$('#modal_collectively_setting').on('click', '.btn_slot_min', btn_slot_min_Clicked);
	$('#modal_collectively_setting').on('click', '.btn_slot_default', function () { btn_slot_default_Clicked($(this)); });
	$('#modal_collectively_setting').on('input', '.coll_slot_range', function () { coll_slot_range_Changed($(this)); });
	$('#modal_collectively_setting').on('input', '.coll_slot_input', function () { coll_slot_input_Changed($(this)); });
	$('#modal_collectively_setting').on('focus', '.coll_slot_input', function () { $(this).select(); });
	$('#modal_collectively_setting').on('click', '.btn_remodel', function () { btn_remodel_Clicked($(this)); });
	$('#modal_collectively_setting').on('click', '.btn_fighter_prof_max', btn_fighter_prof_max_Clicked);
	$('#modal_collectively_setting').on('click', '.btn_prof', function () { btn_prof_Clicked($(this)); });
	$('#modal_stage2_detail').on('input', '#stage2_detail_slot', stage2_slot_input_Changed);
	$('#modal_stage2_detail').on('change', '#stage2_detail_avoid', calculateStage2Detail);
	$('#modal_stage2_detail').on('input', '#free_anti_air_weight', function () { free_modify_input_Changed($(this)) });
	$('#modal_stage2_detail').on('input', '#free_anti_air_bornus', function () { free_modify_input_Changed($(this)) });
	$('#modal_contact_detail').on('change', '.custom-check', contact_detail_redraw);
	$('#modal_fleet_antiair_input').on('change', '#antiair_air_raid', updateFleetStage2Table);
	$('#modal_fleet_antiair_input').on('change', '#fleet_antiair_formation', updateFleetStage2Table);
	$('#modal_fleet_antiair_input').on('click', '.anti_air_cutin_toggle', function () { anti_air_cutin_toggle_Clicked($(this)); });
	$('#modal_manual_enemy').on('input', '.enemy_slot', function () { manual_enemy_input_Changed($(this)) });
	$('#modal_manual_enemy').on('input', '#manual_aa_bonus', function () { manual_enemy_input_Changed($(this)) });
	$('#modal_manual_enemy').on('change', '.enemy_planes', calculateVirtualEnemy);
	$('#modal_manual_enemy').on('click', '#commit_enemy', commit_enemy_Clicked);
	$('#modal_manual_enemy').on('click', '#rollback_enemy', rollback_enemy_Clicked);
	$('#modal_lb_target').on('click', '.btn', function () { btn_target_Clicked($(this)) });
	$('#modal_level_input').on('focus', '.ship_level_input', function () { $(this).select(); });
	$('#modal_level_input').on('input', '.ship_level_input', function () { ship_level_input_Changed($(this)); });
	$('#modal_level_input').on('input', '.ship_level_range', function () { ship_level_range_Changed($(this)); });
	$('#modal_level_input').on('click', '.btn-sm', function () { level_Clicked($(this)); });
	$('#modal_luck_input').on('focus', '.ship_luck_input', function () { $(this).select(); });
	$('#modal_luck_input').on('input', '.ship_luck_input', function () { ship_luck_input_Changed($(this)); });
	$('#modal_luck_input').on('input', '.ship_luck_range', function () { ship_luck_range_Changed($(this)); });
	$('#modal_confirm').on('click', '.btn_ok', modal_confirm_ok_Clicked);
	$('#modal_confirm').on('click', '#error_str', function () { if (copyInputTextToClipboard($(this))) inform_success('コピーしました'); });
	$('#modal_confirm').on('click', '#send_error', sendError);
	$('#fixed_btns').on('show.bs.collapse', '.collapse', fixedMenuShown);
	$('#fixed_btns').on('hide.bs.collapse', '.collapse', fixedMenuHidden);
	$('#fixed_btns').on('click', '.sub_btn.save', btn_save_preset_Clicked);
	$('#fixed_btns').on('click', '.sub_btn.memo', btn_memo_Clicked);
	$('#fixed_btns').on('click', '.sub_btn.share', function () { $('#modal_share').modal('show'); });
	$('#fixed_btns').on('click', '.sub_btn.undo', btn_undo_Clicked);
	$('#fixed_btns').on('click', '.sub_btn.redo', btn_redo_Clicked);
	$('#fixed_btns').on('click', '.sub_btn.go_back', function () { window.location.href = '../list/'; });
	$('#modal_preset_memo').on('input', '#preset_memo', function () { preset_memo_Changed($(this)); });
	$('#modal_preset_memo').on('click', '.btn_commit_preset', function () { btn_commit_preset_memo_Clicked($(this)); });
	$('#modal_ship_reserve').on('click', '#btn_add_reserve', btn_add_reserve_Clicked);
	$('#modal_ship_reserve').on('click', '.reserve_ship', function () { reserve_ship_Clicked($(this)) });
	$('#modal_ship_reserve').on('click', '.btn_remove_reserve', function (e) { btn_remove_reserve_Clicked($(this), e) });
	$('#modal_ship_reserve').on('click', '.btn_reset', btn_reset_reserve_Clicked);
	$('#modal_include_selector').on('click', '.fleet_selectable', function () { fleet_selectable_Clicked($(this)); });
	$('#modal_include_selector').on('click', '#btn_include_deck', btn_include_deck_Clicked);
	$('#modal_reference').on('click', '#anti_air_ranking_normal_registed', createAirPowerRanking);
	$('#modal_reference').on('click', '#anti_air_ranking_defense_registed', createDefenceRanking);
	$('#modal_reference').on('click', '#recover_planes_checkes .custom-check', createRecoverPlaneTable);
	$('#btn_save_preset').click(btn_save_preset_Clicked);
	$('#btn_save_preset_sub').click(btn_save_preset_sub_Clicked);
	$('#btn_reference').click(btn_reference_Clicked);
	$('#btn_twitter').click(btn_twitter_Clicked);
	$('#btn_share').click(() => { $('#modal_share').modal('show'); });
	$('#btn_undo').click(btn_undo_Clicked);
	$('#btn_redo').click(btn_redo_Clicked);
	$('#input_url').click(function () { $(this).select(); });
	$('#btn_url_shorten').click(btn_url_shorten_Clicked);
	$('#tool_bar').on({
		mouseenter: function () { showTooltip($(this)[0], "デッキビルダー形式の編成の読み込みや、URLの短縮、所持装備や在籍艦娘情報の反映が可能です。"); },
		mouseleave: function () { hideTooltip($(this)[0]); }
	}, '#btn_url_shorten');
	$('#landBase_content').on({
		mouseenter: function () { showItemToolTip($(this).parent(), true); },
		mouseleave: function () { hideTooltip($(this).parent()[0]); }
	}, '.plane_img');
	$('#friendFleet_content').on({
		mouseenter: function () { showItemToolTip($(this).parent()); },
		mouseleave: function () { hideTooltip($(this).parent()[0]); }
	}, '.plane_img');
	$('#friendFleet_content').on({
		mouseenter: function () { showTooltip($(this)[0], "ロックすると、おまかせ配備使用時にこのスロットの上書きを保護できます。"); },
		mouseleave: function () { hideTooltip($(this)[0]); }
	}, '.plane_unlock');
	$('#friendFleet_content').on({
		mouseenter: function () { showTooltip($(this)[0], "ロック中です。おまかせ配備使用時、このスロットは変更されません。"); },
		mouseleave: function () { hideTooltip($(this)[0]); }
	}, '.plane_lock');
	$('#friendFleet_content').on({
		mouseenter: function () { showTooltip($(this)[0], "艦娘、装備は維持したまま計算対象から省きます。"); },
		mouseleave: function () { hideTooltip($(this)[0]); }
	}, '.ship_disabled');
	$('#main').on({
		mouseenter: function () { showTooltip($(this)[0], "機体プリセット"); },
		mouseleave: function () { hideTooltip($(this)[0]); }
	}, '.btn_plane_preset');
	$('#landBase_content').on({
		mouseenter: function () { showTooltip($(this)[0], "装備リセット"); },
		mouseleave: function () { hideTooltip($(this)[0]); }
	}, '.btn_reset_landBase');
	$('#friendFleet_content').on({
		mouseenter: function () { showTooltip($(this)[0], "装備リセット"); },
		mouseleave: function () { hideTooltip($(this)[0]); }
	}, '.btn_reset_ship_plane');
	$('#friendFleet_content').on({
		mouseenter: function () { showTooltip($(this)[0], "閉じる"); },
		mouseleave: function () { hideTooltip($(this)[0]); }
	}, '.btn_remove_ship');
	$('#friendFleet_content').on({
		mouseenter: function () { showTooltip($(this)[0], "艦娘保留リストの登録や削除、保留リストからの展開を行います。"); },
		mouseleave: function () { hideTooltip($(this)[0]); }
	}, '.btn_ship_toggle');
	$('#modal_ship_reserve').on({
		mouseenter: function () { showTooltip($(this)[0], "艦娘保留リストから削除します。"); },
		mouseleave: function () { hideTooltip($(this)[0]); }
	}, '.btn_remove_reserve');
	$('#enemyFleet_content').on({
		mouseenter: function () { showEnemyStatusToolTip($(this)); },
		mouseleave: function () { hideTooltip($(this)[0]); }
	}, '.enemy_content');
	$('#fucking_enemie_table_tbody').on({
		mouseenter: function () { showEnemyStatusToolTip($(this)); },
		mouseleave: function () { hideTooltip($(this)[0]); }
	}, '.enemy_info_tr');
	$('#result_content').on({
		mouseenter: function () { shoot_down_table_tbody_MouseEnter($(this)); },
		mouseleave: function () { shoot_down_table_tbody_MouseLeave($(this)); }
	}, '#shoot_down_table_tbody td');
	$('#result_content').on({
		mouseenter: function () { progress_area_MouseEnter($(this)); },
		mouseleave: function () { progress_area_MouseLeave($(this)); }
	}, '.progress_area');
	$('#result_content').on({
		mouseenter: function () { rate_table_MouseEnter($(this)); },
		mouseleave: function () { rate_table_MouseLeave($(this)); }
	}, '#rate_table tbody td');
	$('#result_content').on({
		mouseenter: function () { enemy_shoot_down_table_tbody_MouseEnter($(this)); },
		mouseleave: function () { enemy_shoot_down_table_tbody_MouseLeave($(this)); }
	}, '#enemy_shoot_down_tbody td');
	$('#result_content').on({
		mouseenter: function () { showEnemyPlaneToolTip($(this)); },
		mouseleave: function () { hideTooltip($(this)[0]); }
	}, '.img-size-36');
	$('#enemy_pattern_tbody').on({
		mouseenter: function () { showEnemyStatusToolTip($(this)); },
		mouseleave: function () { hideTooltip($(this)[0]); }
	}, '.enemy_pattern_tr');
	$('#modal_plane_select').on({
		mouseenter: function () {
			const $this = $(this);
			timer = setTimeout(function () { showPlaneBasicToolTip($this); }, 500);
		},
		mouseleave: function () {
			if (timer) clearTimeout(timer);
			hideTooltip($(this)[0]);
		}
	}, '.plane_tr, .plane_tr_disabled');
	$('#modal_plane_select').on({
		mouseenter: function () { showTooltip($(this)[0], $(this).find('img').attr('alt')); },
		mouseleave: function () { hideTooltip($(this)[0]); }
	}, '.item_type');

	// 画面サイズ変更
	$(window).resize(function () {
		if (timer) clearTimeout(timer);
		timer = setTimeout(function () {
			if ($('#lb_tab_select').css('display') !== 'none' && !$('#lb_item1').attr('class').includes('tab-pane')) {
				$('.lb_tab').addClass('tab-pane fade');
				$('.lb_tab:first').tab('show');
				$('.baseNo').removeClass('sortable_handle cur_move');
			}
			else if ($('#lb_tab_select').css('display') === 'none' && $('#lb_item1').attr('class').includes('tab-pane')) {
				$('.lb_tab').removeClass('tab-pane fade').show().fadeIn();
				$('.baseNo').addClass('sortable_handle cur_move');
			}
		}, 50);
	});

	/*==================================
			ドラッグ & ドロップ
	==================================*/
	Sortable.create($('#main')[0], {
		handle: '.trade_enabled',
		animation: 200,
		scroll: true,
		onEnd: main_contents_Sortable_End
	});
	Sortable.create($('#battle_result')[0], {
		handle: '.drag_handle',
		animation: 200,
		scroll: true,
	});
	Sortable.create($('#lb_tab_parent')[0], {
		handle: '.sortable_handle',
		animation: 200,
		onEnd: function () {
			// 第何航空隊か整合性取る
			$('.lb_tab').each((i, e) => {
				$(e).attr('id', 'lb_item' + (i + 1));
				$(e).find('.baseNo').html('<span>第' + (i + 1) + '基地航空隊</span>');
				$(e).find('.simple_lb_progress').each((ii, ee) => {
					$(ee).attr('id', `simple_lb_bar_${i + 1}_${ii + 1}`);
				});
				$(e).find('.btn_show_contact_rate_lb')[0].dataset.lb = (i + 1);
			});
			inform_warning('基地航空隊の入れ替えが行われました。基地航空隊の派遣先を確認してください。');
			$('.btn_lb_target').removeClass('btn-outline-success');
			$('.btn_lb_target').addClass('btn-outline-danger');
			$('.lb_target_alert').removeClass('d-none');
			calculate(true, false, false);
		}
	});
	Sortable.create(document.getElementById('fleet_tabs_container'), {
		delay: 80,
		animation: 200,
		onEnd: function () {

			// そもそも入れ替わってるか？
			if ($('#fleet_tabs_container a:first').attr('href') === '#friendFleet_item1') {
				return;
			}

			// 現在展開中のタブhref
			let tabId = 1;

			$('#fleet_tabs_container a').each((i, e) => {
				$(e).text(`第${i + 1}艦隊`);
				$(e).attr('href', `#friendFleet_item${i + 1}`);
				if ($(e).hasClass('active')) tabId = i + 1;
			});

			const border = getMaxShipCount();
			const fleet = createFriendFleetPreset();

			// 第1第2をそっくり入れ替え
			for (const ship of fleet) {
				ship[2] += ship[2] >= border ? -border : border;
			}

			// 手動でタブ切替え
			$('.friendFleet_tab').removeClass('show active');
			document.getElementById('friendFleet_item' + tabId).classList.add('show', 'active');

			expandMainPreset([
				[], fleet, [],
				document.getElementById('adapt_stage2')['checked'] ? selectedFormations : null,
				isDefMode,
				createAirRaidEnemyFleetPreset(),
				castInt($('#admin_lv').val())
			], false, true, false);
			calculate(false, true, false);
		}
	});
	$('.ship_tab').draggable({
		delay: 100,
		helper: 'clone',
		handle: '.sortable_handle',
		zIndex: 1000,
	});
	$('.ship_tab').droppable({
		accept: ".ship_tab",
		hoverClass: "ship_tab_hover",
		tolerance: "pointer",
		drop: function (e, ui) {
			// 単純に位置を入れ替えるだけ
			const insert = ui.draggable;
			const target = $(this);

			if (insert.length && target.length) {
				/** @type {HTMLElement} */
				const parentTab = target.parent()[0];
				/** @type {HTMLElement} */
				const insertNode = insert[0];
				/** @type {HTMLElement} */
				const targetNode = target[0];
				// 移動前に、移動元のお隣さんを取得 なければnull
				const nextNode = insertNode.nextSibling;

				TradeHTMLWithAnimation(insertNode, targetNode, () => {
					// まずは移動
					parentTab.insertBefore(insertNode, targetNode);
					// 元のお隣さんの前に追加
					parentTab.insertBefore(targetNode, nextNode);
					// 念のための再計算
					calculate(false, true, false);
				});
			}
		}
	});

	$('.lb_plane').draggable({
		delay: 100,
		helper: 'clone',
		handle: '.drag_handle',
		zIndex: 1000,
		start: function (e, ui) {
			$(ui.helper).css('width', 320);
			$(ui.helper).find('.dropdown-menu').remove();
		},
		stop: function () { lb_plane_DragEnd($(this)); }
	});
	$('.lb_plane').droppable({
		accept: ".lb_plane",
		hoverClass: "plane_draggable_hover",
		tolerance: "pointer",
		drop: function (e, ui) { lb_plane_Drop($(this), ui); }
	});
	$('#landBase_content_main').droppable({
		accept: ".lb_plane",
		tolerance: "pointer",
		over: (e, ui) => {
			ui.helper.animate({ 'opacity': '1.0' }, 100);
			isOut = false;
		},
		out: (e, ui) => {
			ui.helper.animate({ 'opacity': '0.2' }, 100);
			isOut = true;
		}
	});

	$('.ship_plane_draggable').draggable({
		delay: 100,
		helper: 'clone',
		handle: '.drag_handle',
		zIndex: 1000,
		cursorAt: { left: 55 },
		start: function (e, ui) { ship_plane_DragStart(ui); },
		stop: function () { ship_plane_DragEnd($(this)); }
	});
	$('.ship_plane').droppable({
		accept: ".ship_plane_draggable",
		hoverClass: "plane_draggable_hover",
		tolerance: "pointer",
		over: function (e, ui) { ship_plane_DragOver($(this), ui); },
		drop: function (e, ui) { ship_plane_Drop($(this), ui); }
	});
	$('.friendFleet_tab').droppable({
		accept: ".ship_plane_draggable",
		tolerance: "pointer",
		over: function (e, ui) {
			isOut = false;
			ui.helper.stop().animate({ 'opacity': '1.0' }, 100);
		},
		out: function (e, ui) {
			isOut = true;
			ui.helper.stop().animate({ 'opacity': '0.2' }, 100);
		}
	});

	Sortable.create($('#battle_container')[0], {
		handle: '.sortable_handle',
		animation: 150,
		onEnd: function () {
			// 何戦目か整合性取る
			$('.battle_content').each((i, e) => { $(e).find('.battle_no').text(i + 1); });
			calculate();
		}
	});

	$('#main').fadeIn();
	$('#simulator_loading').remove();
});