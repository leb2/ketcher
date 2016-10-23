var Vec2 = require('../util/vec2');
var Set = require('../util/set');

var Struct = require('../chem/struct');

var ReAtom = require('../render/reatom');
var ReBond = require('../render/rebond');
var ReRxnPlus = require('../render/rerxnplus');
var ReRxnArrow = require('../render/rerxnarrow');
var ReFrag = require('../render/refrag');
var ReRGroup = require('../render/rergroup');
var ReChiralFlag = require('../render/rechiralflag');
var ReSGroup = require('../render/resgroup');

var ui = global.ui;

var DEBUG = { debug: false, logcnt: 0, logmouse: false, hl: false };
DEBUG.logMethod = function () { };

function Base() {
	this.type = 'OpBase';

	// assert here?
	this.execute = function () {
		throw new Error('Operation.execute() is not implemented');
	};
	this.invert = function () {
		throw new Error('Operation.invert() is not implemented');
	};

	this.perform = function (editor) {
		this.execute(editor);
		/* eslint-disable no-underscore-dangle */
		if (!this._inverted) {
			this._inverted = this.invert();
			this._inverted._inverted = this;
		}
		return this._inverted;
	};
	this.isDummy = function (editor) {
		return this._isDummy ? this._isDummy(editor) : false;
		/* eslint-enable no-underscore-dangle */
	};
}

function AtomAdd(atom, pos) {
	this.data = { aid: null, atom: atom, pos: pos };
	this.execute = function (editor) {
		var rnd = editor.render;
		var restruct = rnd.ctab;
		var struct = restruct.molecule;
		var pp = {};
		if (this.data.atom) {
			for (var p in this.data.atom)
				pp[p] = this.data.atom[p];
		}
		pp.label = pp.label || 'C';
		if (!Object.isNumber(this.data.aid))
			this.data.aid = struct.atoms.add(new Struct.Atom(pp));
		else
			struct.atoms.set(this.data.aid, new Struct.Atom(pp));

		// notifyAtomAdded
		var atomData = new ReAtom(restruct.molecule.atoms.get(this.data.aid));
		atomData.component = restruct.connectedComponents.add(Set.single(this.data.aid));
		restruct.atoms.set(this.data.aid, atomData);
		restruct.markAtom(this.data.aid, 1);

		struct.atomSetPos(this.data.aid, new Vec2(this.data.pos));
	};
	this.invert = function () {
		var ret = new AtomDelete();
		ret.data = this.data;
		return ret;
	};
}
AtomAdd.prototype = new Base();

function AtomDelete(aid) {
	this.data = { aid: aid, atom: null, pos: null };
	this.execute = function (editor) {
		var rnd = editor.render;
		var restruct = rnd.ctab;
		var struct = restruct.molecule;
		if (!this.data.atom) {
			this.data.atom = struct.atoms.get(this.data.aid);
			this.data.pos = this.data.atom.pp;
		}

		// notifyAtomRemoved(this.data.aid);
		var atom = restruct.atoms.get(this.data.aid);
		var set = restruct.connectedComponents.get(atom.component);
		Set.remove(set, this.data.aid);
		if (Set.size(set) == 0)
			restruct.connectedComponents.remove(atom.component);
		restruct.clearVisel(atom.visel);
		restruct.atoms.unset(this.data.aid);
		restruct.markItemRemoved();

		struct.atoms.remove(this.data.aid);
	};
	this.invert = function () {
		var ret = new AtomAdd();
		ret.data = this.data;
		return ret;
	};
}
AtomDelete.prototype = new Base();

function AtomAttr(aid, attribute, value) {
	this.data = { aid: aid, attribute: attribute, value: value };
	this.data2 = null;
	this.execute = function (editor) {
		var atom = editor.render.ctab.molecule.atoms.get(this.data.aid);
		if (!this.data2)
			this.data2 = { aid: this.data.aid, attribute: this.data.attribute, value: atom[this.data.attribute] };
		atom[this.data.attribute] = this.data.value;
		invalidateAtom(editor.render.ctab, this.data.aid);
	};
	this._isDummy = function (editor) { // eslint-disable-line no-underscore-dangle
		return editor.render.ctab.molecule.atoms.get(this.data.aid)[this.data.attribute] == this.data.value;
	};
	this.invert = function () {
		var ret = new AtomAttr();
		ret.data = this.data2;
		ret.data2 = this.data;
		return ret;
	};
}
AtomAttr.prototype = new Base();

function AtomMove(aid, d, noinvalidate) {
	this.data = { aid: aid, d: d, noinvalidate: noinvalidate };
	this.execute = function (editor) {
		var rnd = editor.render;
		var restruct = rnd.ctab;
		var struct = restruct.molecule;
		var aid = this.data.aid;
		var d = this.data.d;
		struct.atoms.get(aid).pp.add_(d); // eslint-disable-line no-underscore-dangle
		restruct.atoms.get(aid).visel.translate(rnd.ps(d));
		this.data.d = d.negated();
		if (!this.data.noinvalidate)
			invalidateAtom(restruct, aid, 1);
	};
	this._isDummy = function () { // eslint-disable-line no-underscore-dangle
		return this.data.d.x == 0 && this.data.d.y == 0;
	};
	this.invert = function () {
		var ret = new AtomMove();
		ret.data = this.data;
		return ret;
	};
}
AtomMove.prototype = new Base();

function BondMove(bid, d) {
	this.data = { bid: bid, d: d };
	this.execute = function (editor) {
		var rnd = editor.render;
		var restruct = rnd.ctab;
		restruct.bonds.get(this.data.bid).visel.translate(rnd.ps(this.data.d));
		this.data.d = this.data.d.negated();
	};
	this.invert = function () {
		var ret = new BondMove();
		ret.data = this.data;
		return ret;
	};
}
BondMove.prototype = new Base();

function LoopMove(id, d) {
	this.data = { id: id, d: d };
	this.execute = function (editor) {
		var rnd = editor.render;
		var restruct = rnd.ctab;
		// not sure if there should be an action to move a loop in the first place
		// but we have to somehow move the aromatic ring, which is associated with the loop, rather than with any of the bonds
		if (restruct.reloops.get(this.data.id) && restruct.reloops.get(this.data.id).visel)
			restruct.reloops.get(this.data.id).visel.translate(rnd.ps(this.data.d));
		this.data.d = this.data.d.negated();
	};
	this.invert = function () {
		var ret = new LoopMove();
		ret.data = this.data;
		return ret;
	};
}
LoopMove.prototype = new Base();

function SGroupAtomAdd(sgid, aid) {
	this.type = 'OpSGroupAtomAdd';
	this.data = { aid: aid, sgid: sgid };
	this.execute = function (editor) {
		var rnd = editor.render;
		var restruct = rnd.ctab;
		var struct = restruct.molecule;
		var aid = this.data.aid;
		var sgid = this.data.sgid;
		var atom = struct.atoms.get(aid);
		var sg = struct.sgroups.get(sgid);
		if (sg.atoms.indexOf(aid) >= 0)
			throw new Error('The same atom cannot be added to an S-group more than once');
		if (!atom)
			throw new Error('OpSGroupAtomAdd: Atom ' + aid + ' not found');
		struct.atomAddToSGroup(sgid, aid);
		invalidateAtom(restruct, aid);
	};
	this.invert = function () {
		var ret = new SGroupAtomRemove();
		ret.data = this.data;
		return ret;
	};
}
SGroupAtomAdd.prototype = new Base();

function SGroupAtomRemove(sgid, aid) {
	this.type = 'OpSGroupAtomRemove';
	this.data = { aid: aid, sgid: sgid };
	this.execute = function (editor) {
		var aid = this.data.aid;
		var sgid = this.data.sgid;
		var rnd = editor.render;
		var restruct = rnd.ctab;
		var struct = restruct.molecule;
		var atom = struct.atoms.get(aid);
		var sg = struct.sgroups.get(sgid);
		Struct.SGroup.removeAtom(sg, aid);
		Set.remove(atom.sgs, sgid);
		invalidateAtom(restruct, aid);
	};
	this.invert = function () {
		var ret = new SGroupAtomAdd();
		ret.data = this.data;
		return ret;
	};
}
SGroupAtomRemove.prototype = new Base();

function SGroupAttr(sgid, attr, value) {
	this.type = 'OpSGroupAttr';
	this.data = { sgid: sgid, attr: attr, value: value };
	this.execute = function (editor) {
		var rnd = editor.render;
		var restruct = rnd.ctab;
		var struct = restruct.molecule;
		var sgid = this.data.sgid;
		var sg = struct.sgroups.get(sgid);
		if (sg.type == 'DAT' && restruct.sgroupData.has(sgid)) { // clean the stuff here, else it might be left behind if the sgroups is set to "attached"
			restruct.clearVisel(restruct.sgroupData.get(sgid).visel);
			restruct.sgroupData.unset(sgid);
		}

		this.data.value = sg.setAttr(this.data.attr, this.data.value);
	};
	this.invert = function () {
		var ret = new SGroupAttr();
		ret.data = this.data;
		return ret;
	};
}
SGroupAttr.prototype = new Base();

function SGroupCreate(sgid, type, pp) {
	this.type = 'OpSGroupCreate';
	this.data = { sgid: sgid, type: type, pp: pp };
	this.execute = function (editor) {
		var rnd = editor.render;
		var restruct = rnd.ctab;
		var struct = restruct.molecule;
		var sg = new Struct.SGroup(this.data.type);
		var sgid = this.data.sgid;
		sg.id = sgid;
		struct.sgroups.set(sgid, sg);
		if (this.data.pp)
			struct.sgroups.get(sgid).pp = new Vec2(this.data.pp);
		restruct.sgroups.set(sgid, new ReSGroup(struct.sgroups.get(sgid)));
		this.data.sgid = sgid;
	};
	this.invert = function () {
		var ret = new SGroupDelete();
		ret.data = this.data;
		return ret;
	};
}
SGroupCreate.prototype = new Base();

function SGroupDelete(sgid) {
	this.type = 'OpSGroupDelete';
	this.data = { sgid: sgid };
	this.execute = function (editor) {
		var rnd = editor.render;
		var restruct = rnd.ctab;
		var struct = restruct.molecule;
		var sgid = this.data.sgid;
		var sg = restruct.sgroups.get(sgid);
		this.data.type = sg.item.type;
		this.data.pp = sg.item.pp;
		if (sg.item.type == 'DAT' && restruct.sgroupData.has(sgid)) {
			restruct.clearVisel(restruct.sgroupData.get(sgid).visel);
			restruct.sgroupData.unset(sgid);
		}

		restruct.clearVisel(sg.visel);
		if (sg.item.atoms.length != 0)
			throw new Error('S-Group not empty!');
		restruct.sgroups.unset(sgid);
		struct.sgroups.remove(sgid);
	};
	this.invert = function () {
		var ret = new SGroupCreate();
		ret.data = this.data;
		return ret;
	};
}
SGroupDelete.prototype = new Base();

function SGroupAddToHierarchy(sgid) {
	this.type = 'OpSGroupAddToHierarchy';
	this.data = { sgid: sgid };
	this.execute = function (editor) {
		var rnd = editor.render;
		var restruct = rnd.ctab;
		var struct = restruct.molecule;
		var sgid = this.data.sgid;
		var relations = struct.sGroupForest.insert(sgid, this.data.parent, this.data.children);
		this.data.parent = relations.parent;
		this.data.children = relations.children;
	};
	this.invert = function () {
		var ret = new SGroupRemoveFromHierarchy();
		ret.data = this.data;
		return ret;
	};
}
SGroupAddToHierarchy.prototype = new Base();

function SGroupRemoveFromHierarchy(sgid) {
	this.type = 'OpSGroupRemoveFromHierarchy';
	this.data = { sgid: sgid };
	this.execute = function (editor) {
		var rnd = editor.render;
		var restruct = rnd.ctab;
		var struct = restruct.molecule;
		var sgid = this.data.sgid;
		this.data.parent = struct.sGroupForest.parent.get(sgid);
		this.data.children = struct.sGroupForest.children.get(sgid);
		struct.sGroupForest.remove(sgid);
	};
	this.invert = function () {
		var ret = new SGroupAddToHierarchy();
		ret.data = this.data;
		return ret;
	};
}
SGroupRemoveFromHierarchy.prototype = new Base();

function BondAdd(begin, end, bond) {
	this.data = { bid: null, bond: bond, begin: begin, end: end };
	this.execute = function (editor) { // eslint-disable-line max-statements
		var rnd = editor.render;
		var restruct = rnd.ctab;
		var struct = restruct.molecule;
		if (this.data.begin == this.data.end)
			throw new Error('Distinct atoms expected');
		if (DEBUG.debug && this.molecule.checkBondExists(this.data.begin, this.data.end))
			throw new Error('Bond already exists');

		invalidateAtom(restruct, this.data.begin, 1);
		invalidateAtom(restruct, this.data.end, 1);

		var pp = {};
		if (this.data.bond) {
			for (var p in this.data.bond)
				pp[p] = this.data.bond[p];
		}
		pp.type = pp.type || Struct.Bond.PATTERN.TYPE.SINGLE;
		pp.begin = this.data.begin;
		pp.end = this.data.end;

		if (!Object.isNumber(this.data.bid))
			this.data.bid = struct.bonds.add(new Struct.Bond(pp));
		else
			struct.bonds.set(this.data.bid, new Struct.Bond(pp));
		struct.bondInitHalfBonds(this.data.bid);
		struct.atomAddNeighbor(struct.bonds.get(this.data.bid).hb1);
		struct.atomAddNeighbor(struct.bonds.get(this.data.bid).hb2);

		// notifyBondAdded
		restruct.bonds.set(this.data.bid, new ReBond(restruct.molecule.bonds.get(this.data.bid)));
		restruct.markBond(this.data.bid, 1);
	};
	this.invert = function () {
		var ret = new BondDelete();
		ret.data = this.data;
		return ret;
	};
}
BondAdd.prototype = new Base();

function BondDelete(bid) {
	this.data = { bid: bid, bond: null, begin: null, end: null };
	this.execute = function (editor) {  // eslint-disable-line max-statements
		var rnd = editor.render;
		var restruct = rnd.ctab;
		var struct = restruct.molecule;
		if (!this.data.bond) {
			this.data.bond = struct.bonds.get(this.data.bid);
			this.data.begin = this.data.bond.begin;
			this.data.end = this.data.bond.end;
		}

		invalidateBond(restruct, this.data.bid);

		// notifyBondRemoved
		var rebond = restruct.bonds.get(this.data.bid);
		[rebond.b.hb1, rebond.b.hb2].each(function (hbid) {
			var hb = restruct.molecule.halfBonds.get(hbid);
			if (hb.loop >= 0)
				restruct.loopRemove(hb.loop);
		}, restruct);
		restruct.clearVisel(rebond.visel);
		restruct.bonds.unset(this.data.bid);
		restruct.markItemRemoved();

		var bond = struct.bonds.get(this.data.bid);
		[bond.hb1, bond.hb2].each(function (hbid) {
			var hb = struct.halfBonds.get(hbid);
			var atom = struct.atoms.get(hb.begin);
			var pos = atom.neighbors.indexOf(hbid);
			var prev = (pos + atom.neighbors.length - 1) % atom.neighbors.length;
			var next = (pos + 1) % atom.neighbors.length;
			struct.setHbNext(atom.neighbors[prev], atom.neighbors[next]);
			atom.neighbors.splice(pos, 1);
		}, this);
		struct.halfBonds.unset(bond.hb1);
		struct.halfBonds.unset(bond.hb2);

		struct.bonds.remove(this.data.bid);
	};
	this.invert = function () {
		var ret = new BondAdd();
		ret.data = this.data;
		return ret;
	};
}
BondDelete.prototype = new Base();

function BondAttr(bid, attribute, value) {
	this.data = { bid: bid, attribute: attribute, value: value };
	this.data2 = null;
	this.execute = function (editor) {
		var bond = editor.render.ctab.molecule.bonds.get(this.data.bid);
		if (!this.data2)
			this.data2 = { bid: this.data.bid, attribute: this.data.attribute, value: bond[this.data.attribute] };

		bond[this.data.attribute] = this.data.value;

		invalidateBond(editor.render.ctab, this.data.bid);
		if (this.data.attribute == 'type')
			invalidateLoop(editor.render.ctab, this.data.bid);
	};
	this._isDummy = function (editor) { // eslint-disable-line no-underscore-dangle
		return editor.render.ctab.molecule.bonds.get(this.data.bid)[this.data.attribute] == this.data.value;
	};
	this.invert = function () {
		var ret = new BondAttr();
		ret.data = this.data2;
		ret.data2 = this.data;
		return ret;
	};
}
BondAttr.prototype = new Base();

function FragmentAdd(frid) {
	this.frid = Object.isUndefined(frid) ? null : frid;
	this.execute = function (editor) {
		var restruct = editor.render.ctab;
		var struct = restruct.molecule;
		var frag = {};
		if (this.frid == null)
			this.frid = struct.frags.add(frag);
		else
			struct.frags.set(this.frid, frag);
		restruct.frags.set(this.frid, new ReFrag(frag)); // TODO add ReStruct.notifyFragmentAdded
	};
	this.invert = function () {
		return new FragmentDelete(this.frid);
	};
}
FragmentAdd.prototype = new Base();

function FragmentDelete(frid) {
	this.frid = frid;
	this.execute = function (editor) {
		var rnd = editor.render;
		var restruct = rnd.ctab;
		var struct = restruct.molecule;
		invalidateItem(restruct, 'frags', this.frid, 1);
		restruct.frags.unset(this.frid);
		struct.frags.remove(this.frid); // TODO add ReStruct.notifyFragmentRemoved
	};
	this.invert = function () {
		return new FragmentAdd(this.frid);
	};
}
FragmentDelete.prototype = new Base();

function RGroupAttr(rgid, attribute, value) {
	this.data = { rgid: rgid, attribute: attribute, value: value };
	this.data2 = null;
	this.execute = function (editor) {
		var rgp = editor.render.ctab.molecule.rgroups.get(this.data.rgid);
		if (!this.data2)
			this.data2 = { rgid: this.data.rgid, attribute: this.data.attribute, value: rgp[this.data.attribute] };

		rgp[this.data.attribute] = this.data.value;

		invalidateItem(editor.render.ctab, 'rgroups', this.data.rgid);
	};
	this._isDummy = function (editor) { // eslint-disable-line no-underscore-dangle
		return editor.render.ctab.molecule.rgroups.get(this.data.rgid)[this.data.attribute] == this.data.value;
	};
	this.invert = function () {
		var ret = new RGroupAttr();
		ret.data = this.data2;
		ret.data2 = this.data;
		return ret;
	};
}
RGroupAttr.prototype = new Base();

function RGroupFragment(rgid, frid, rg) {
	this.rgid_new = rgid;
	this.rg_new = rg;
	this.rgid_old = null;
	this.rg_old = null;
	this.frid = frid;
	this.execute = function (editor) { // eslint-disable-line max-statements
		var restruct = editor.render.ctab;
		var struct = restruct.molecule;
		this.rgid_old = this.rgid_old || Struct.RGroup.findRGroupByFragment(struct.rgroups, this.frid);
		this.rg_old = (this.rgid_old ? struct.rgroups.get(this.rgid_old) : null);
		if (this.rg_old) {
			this.rg_old.frags.remove(this.rg_old.frags.keyOf(this.frid));
			restruct.clearVisel(restruct.rgroups.get(this.rgid_old).visel);
			if (this.rg_old.frags.count() == 0) {
				restruct.rgroups.unset(this.rgid_old);
				struct.rgroups.unset(this.rgid_old);
				restruct.markItemRemoved();
			} else {
				restruct.markItem('rgroups', this.rgid_old, 1);
			}
		}
		if (this.rgid_new) {
			var rgNew = struct.rgroups.get(this.rgid_new);
			if (!rgNew) {
				rgNew = this.rg_new || new Struct.RGroup();
				struct.rgroups.set(this.rgid_new, rgNew);
				restruct.rgroups.set(this.rgid_new, new ReRGroup(rgNew));
			} else {
				restruct.markItem('rgroups', this.rgid_new, 1);
			}
			rgNew.frags.add(this.frid);
		}
	};
	this.invert = function () {
		return new RGroupFragment(this.rgid_old, this.frid, this.rg_old);
	};
}
RGroupFragment.prototype = new Base();

function RxnArrowAdd(pos) {
	this.data = { arid: null, pos: pos };
	this.execute = function (editor) {
		var rnd = editor.render;
		var restruct = rnd.ctab;
		var struct = restruct.molecule;
		if (!Object.isNumber(this.data.arid))
			this.data.arid = struct.rxnArrows.add(new Struct.RxnArrow());
		else
			struct.rxnArrows.set(this.data.arid, new Struct.RxnArrow());

		// notifyRxnArrowAdded
		restruct.rxnArrows.set(this.data.arid, new ReRxnArrow(restruct.molecule.rxnArrows.get(this.data.arid)));

		struct.rxnArrowSetPos(this.data.arid, new Vec2(this.data.pos));

		invalidateItem(restruct, 'rxnArrows', this.data.arid, 1);
	};
	this.invert = function () {
		var ret = new RxnArrowDelete();
		ret.data = this.data;
		return ret;
	};
}
RxnArrowAdd.prototype = new Base();

function RxnArrowDelete(arid) {
	this.data = { arid: arid, pos: null };
	this.execute = function (editor) {
		var rnd = editor.render;
		var restruct = rnd.ctab;
		var struct = restruct.molecule;
		if (!this.data.pos)
			this.data.pos = struct.rxnArrows.get(this.data.arid).pp;

		// notifyRxnArrowRemoved
		restruct.markItemRemoved();
		restruct.clearVisel(restruct.rxnArrows.get(this.data.arid).visel);
		restruct.rxnArrows.unset(this.data.arid);

		struct.rxnArrows.remove(this.data.arid);
	};
	this.invert = function () {
		var ret = new RxnArrowAdd();
		ret.data = this.data;
		return ret;
	};
}
RxnArrowDelete.prototype = new Base();

function RxnArrowMove(id, d, noinvalidate) {
	this.data = { id: id, d: d, noinvalidate: noinvalidate };
	this.execute = function (editor) {
		var rnd = editor.render;
		var restruct = rnd.ctab;
		var struct = restruct.molecule;
		var id = this.data.id;
		var d = this.data.d;
		struct.rxnArrows.get(id).pp.add_(d); // eslint-disable-line no-underscore-dangle
		restruct.rxnArrows.get(id).visel.translate(rnd.ps(d));
		this.data.d = d.negated();
		if (!this.data.noinvalidate)
			invalidateItem(restruct, 'rxnArrows', id, 1);
	};
	this.invert = function () {
		var ret = new RxnArrowMove();
		ret.data = this.data;
		return ret;
	};
}
RxnArrowMove.prototype = new Base();

function RxnPlusAdd(pos) {
	this.data = { plid: null, pos: pos };
	this.execute = function (editor) {
		var rnd = editor.render;
		var restruct = rnd.ctab;
		var struct = restruct.molecule;
		if (!Object.isNumber(this.data.plid))
			this.data.plid = struct.rxnPluses.add(new Struct.RxnPlus());
		else
			struct.rxnPluses.set(this.data.plid, new Struct.RxnPlus());

		// notifyRxnPlusAdded
		restruct.rxnPluses.set(this.data.plid, new ReRxnPlus(restruct.molecule.rxnPluses.get(this.data.plid)));

		struct.rxnPlusSetPos(this.data.plid, new Vec2(this.data.pos));

		invalidateItem(restruct, 'rxnPluses', this.data.plid, 1);
	};
	this.invert = function () {
		var ret = new RxnPlusDelete();
		ret.data = this.data;
		return ret;
	};
}
RxnPlusAdd.prototype = new Base();

function RxnPlusDelete(plid) {
	this.data = { plid: plid, pos: null };
	this.execute = function (editor) {
		var rnd = editor.render;
		var restruct = rnd.ctab;
		var struct = restruct.molecule;
		if (!this.data.pos)
			this.data.pos = struct.rxnPluses.get(this.data.plid).pp;

		// notifyRxnPlusRemoved
		restruct.markItemRemoved();
		restruct.clearVisel(restruct.rxnPluses.get(this.data.plid).visel);
		restruct.rxnPluses.unset(this.data.plid);

		struct.rxnPluses.remove(this.data.plid);
	};
	this.invert = function () {
		var ret = new RxnPlusAdd();
		ret.data = this.data;
		return ret;
	};
}
RxnPlusDelete.prototype = new Base();

function RxnPlusMove(id, d, noinvalidate) {
	this.data = { id: id, d: d, noinvalidate: noinvalidate };
	this.execute = function (editor) {
		var rnd = editor.render;
		var restruct = rnd.ctab;
		var struct = restruct.molecule;
		var id = this.data.id;
		var d = this.data.d;
		struct.rxnPluses.get(id).pp.add_(d); // eslint-disable-line no-underscore-dangle
		restruct.rxnPluses.get(id).visel.translate(rnd.ps(d));
		this.data.d = d.negated();
		if (!this.data.noinvalidate)
			invalidateItem(restruct, 'rxnPluses', id, 1);
	};
	this.invert = function () {
		var ret = new RxnPlusMove();
		ret.data = this.data;
		return ret;
	};
}
RxnPlusMove.prototype = new Base();

function SGroupDataMove(id, d) {
	this.data = { id: id, d: d };
	this.execute = function (editor) {
		var struct = editor.render.ctab.molecule;
		struct.sgroups.get(this.data.id).pp.add_(this.data.d); // eslint-disable-line no-underscore-dangle
		this.data.d = this.data.d.negated();
		invalidateItem(editor.render.ctab, 'sgroupData', this.data.id, 1); // [MK] this currently does nothing since the DataSGroupData Visel only contains the highlighting/selection and SGroups are redrawn every time anyway
	};
	this.invert = function () {
		var ret = new SGroupDataMove();
		ret.data = this.data;
		return ret;
	};
}
SGroupDataMove.prototype = new Base();

function CanvasLoad(ctab) {
	this.data = { ctab: ctab, norescale: false };
	this.execute = function (editor) {
		var rnd = editor.render;
		var struct = rnd.ctab.molecule;

		rnd.ctab.clearVisels();
		var oldStruct = struct;
		rnd.setMolecule(this.data.ctab, this.data.norescale);
		ui.ctab = rnd.ctab.molecule;

		this.data.ctab = oldStruct;
		this.data.norescale = true;
	};

	this.invert = function () {
		var ret = new CanvasLoad();
		ret.data = this.data;
		return ret;
	};
}
CanvasLoad.prototype = new Base();

function ChiralFlagAdd(pos) {
	this.data = { pos: pos };
	this.execute = function (editor) {
		var rnd = editor.render;
		var restruct = rnd.ctab;
		var struct = restruct.molecule;
		if (restruct.chiralFlags.count() > 0)
			throw new Error('Cannot add more than one Chiral flag');
		restruct.chiralFlags.set(0, new ReChiralFlag(pos));
		struct.isChiral = true;
		invalidateItem(restruct, 'chiralFlags', 0, 1);
	};
	this.invert = function () {
		var ret = new ChiralFlagDelete();
		ret.data = this.data;
		return ret;
	};
}
ChiralFlagAdd.prototype = new Base();

function ChiralFlagDelete() {
	this.data = { pos: null };
	this.execute = function (editor) {
		var rnd = editor.render;
		var restruct = rnd.ctab;
		var struct = restruct.molecule;
		if (restruct.chiralFlags.count() < 1)
			throw new Error('Cannot remove chiral flag');
		restruct.clearVisel(restruct.chiralFlags.get(0).visel);
		this.data.pos = restruct.chiralFlags.get(0).pp;
		restruct.chiralFlags.unset(0);
		struct.isChiral = false;
	};
	this.invert = function () {
		var ret = new ChiralFlagAdd(this.data.pos);
		ret.data = this.data;
		return ret;
	};
}
ChiralFlagDelete.prototype = new Base();

function ChiralFlagMove(d) {
	this.data = { d: d };
	this.execute = function (editor) {
		var rnd = editor.render;
		var restruct = rnd.ctab;
		restruct.chiralFlags.get(0).pp.add_(this.data.d); // eslint-disable-line no-underscore-dangle
		this.data.d = this.data.d.negated();
		invalidateItem(restruct, 'chiralFlags', 0, 1);
	};
	this.invert = function () {
		var ret = new ChiralFlagMove();
		ret.data = this.data;
		return ret;
	};
}
ChiralFlagMove.prototype = new Base();

function invalidateAtom(restruct, aid, level) {
	var atom = restruct.atoms.get(aid);
	restruct.markAtom(aid, level ? 1 : 0);
	var hbs = restruct.molecule.halfBonds;
	for (var i = 0; i < atom.a.neighbors.length; ++i) {
		var hbid = atom.a.neighbors[i];
		if (hbs.has(hbid)) {
			var hb = hbs.get(hbid);
			restruct.markBond(hb.bid, 1);
			restruct.markAtom(hb.end, 0);
			if (level)
				invalidateLoop(restruct, hb.bid);
		}
	}
}

function invalidateLoop(restruct, bid) {
	var bond = restruct.bonds.get(bid);
	var lid1 = restruct.molecule.halfBonds.get(bond.b.hb1).loop;
	var lid2 = restruct.molecule.halfBonds.get(bond.b.hb2).loop;
	if (lid1 >= 0)
		restruct.loopRemove(lid1);
	if (lid2 >= 0)
		restruct.loopRemove(lid2);
}

function invalidateBond(restruct, bid) {
	var bond = restruct.bonds.get(bid);
	invalidateLoop(restruct, bid);
	invalidateAtom(restruct, bond.b.begin, 0);
	invalidateAtom(restruct, bond.b.end, 0);
}

function invalidateItem(restruct, map, id, level) {
	if (map == 'atoms') {
		invalidateAtom(restruct, id, level);
	} else if (map == 'bonds') {
		invalidateBond(restruct, id);
		if (level > 0)
			invalidateLoop(restruct, id);
	} else {
		restruct.markItem(map, id, level);
	}
}

module.exports = {
	AtomAdd: AtomAdd,
	AtomDelete: AtomDelete,
	AtomAttr: AtomAttr,
	AtomMove: AtomMove,
	BondMove: BondMove,
	LoopMove: LoopMove,
	SGroupAtomAdd: SGroupAtomAdd,
	SGroupAtomRemove: SGroupAtomRemove,
	SGroupAttr: SGroupAttr,
	SGroupCreate: SGroupCreate,
	SGroupDelete: SGroupDelete,
	SGroupAddToHierarchy: SGroupAddToHierarchy,
	SGroupRemoveFromHierarchy: SGroupRemoveFromHierarchy,
	BondAdd: BondAdd,
	BondDelete: BondDelete,
	BondAttr: BondAttr,
	FragmentAdd: FragmentAdd,
	FragmentDelete: FragmentDelete,
	RGroupAttr: RGroupAttr,
	RGroupFragment: RGroupFragment,
	RxnArrowAdd: RxnArrowAdd,
	RxnArrowDelete: RxnArrowDelete,
	RxnArrowMove: RxnArrowMove,
	RxnPlusAdd: RxnPlusAdd,
	RxnPlusDelete: RxnPlusDelete,
	RxnPlusMove: RxnPlusMove,
	SGroupDataMove: SGroupDataMove,
	CanvasLoad: CanvasLoad,
	ChiralFlagAdd: ChiralFlagAdd,
	ChiralFlagDelete: ChiralFlagDelete,
	ChiralFlagMove: ChiralFlagMove
};
