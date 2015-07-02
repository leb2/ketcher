/*global require, global, ui:false*/

/*eslint-disable*/

var Set = require('../util/set');
var Vec2 = require('../util/vec2');
var util = require('../util');

require('../chem');
require('../rnd');

var ui = global.ui = global.ui || function () {}; // jshint ignore:line
var chem = global.chem;

//
// Undo/redo actions
//
ui.Action = function ()
{
	this.operations = [];
};

require('./op');

ui.Action.prototype.addOp = function (op) {
	if (!op.isDummy(ui.editor))
		this.operations.push(op);
	return op;
};

ui.Action.prototype.mergeWith = function (action)
{
	this.operations = this.operations.concat(action.operations);
	return this; //rbalabanov: let it be possible to chain actions in code easier
};

// Perform action and return inverted one
ui.Action.prototype.perform = function ()
{
	var action = new ui.Action();
	var idx = 0;

	this.operations.each(function (op) {
		action.addOp(op.perform(ui.editor));
		idx++;
	}, this);

	action.operations.reverse();
	return action;
};

ui.Action.prototype.isDummy = function ()
{
	return this.operations.detect(function (op) {
		return !op.isDummy(ui.editor); // TODO [RB] the condition is always true for ui.Action.Op* operations
	}, this) == null;
};

ui.Action.fromMultipleMove = function (lists, d)
{
	d = new Vec2(d);

	var action = new ui.Action();
	var i;

	var R = ui.render;
	var RS = R.ctab;
	var DS = RS.molecule;
	var bondlist = [];
	var loops = Set.empty();
	var atomsToInvalidate = Set.empty();

	if (lists.atoms) {
		var atomSet = Set.fromList(lists.atoms);
		RS.bonds.each(function (bid, bond){

			if (Set.contains(atomSet, bond.b.begin) && Set.contains(atomSet, bond.b.end)) {
				bondlist.push(bid);
				// add all adjacent loops
				// those that are not completely inside the structure will get redrawn anyway
				util.each(['hb1','hb2'], function (hb){
					var loop = DS.halfBonds.get(bond.b[hb]).loop;
					if (loop >= 0)
						Set.add(loops, loop);
				}, this);
			}
			else if (Set.contains(atomSet, bond.b.begin))
				Set.add(atomsToInvalidate, bond.b.begin);
			else if (Set.contains(atomSet, bond.b.end))
				Set.add(atomsToInvalidate, bond.b.end);
		}, this);
		for (i = 0; i < bondlist.length; ++i) {
			action.addOp(new ui.Action.OpBondMove(bondlist[i], d));
		}
		Set.each(loops, function (loopId){
			if (RS.reloops.get(loopId) && RS.reloops.get(loopId).visel) // hack
				action.addOp(new ui.Action.OpLoopMove(loopId, d));
		}, this);
		for (i = 0; i < lists.atoms.length; ++i) {
			var aid = lists.atoms[i];
			action.addOp(new ui.Action.OpAtomMove(aid, d, !Set.contains(atomsToInvalidate, aid)));
		}
	}

	if (lists.rxnArrows)
		for (i = 0; i < lists.rxnArrows.length; ++i)
			action.addOp(new ui.Action.OpRxnArrowMove(lists.rxnArrows[i], d, true));

	if (lists.rxnPluses)
		for (i = 0; i < lists.rxnPluses.length; ++i)
			action.addOp(new ui.Action.OpRxnPlusMove(lists.rxnPluses[i], d, true));

	if (lists.sgroupData)
		for (i = 0; i < lists.sgroupData.length; ++i)
			action.addOp(new ui.Action.OpSGroupDataMove(lists.sgroupData[i], d));

	if (lists.chiralFlags)
		for (i = 0; i < lists.chiralFlags.length; ++i)
			action.addOp(new ui.Action.OpChiralFlagMove(d));

	return action.perform();
};

ui.Action.fromAtomsAttrs = function (ids, attrs, reset)
{
	var action = new ui.Action();
	(typeof(ids) == 'number' ? [ids] : ids).each(function (id) {
		for (var key in chem.Struct.Atom.attrlist) {
			var value;
			if (key in attrs)
				value = attrs[key];
			else if (reset)
				value = chem.Struct.Atom.attrGetDefault(key);
			else
				continue;
			action.addOp(new ui.Action.OpAtomAttr(id, key, value));
		}
		if (!reset && 'label' in attrs && attrs.label != null && attrs.label != 'L#' && !attrs['atomList']) {
			action.addOp(new ui.Action.OpAtomAttr(id, 'atomList', null));
		}
	}, this);
	return action.perform();
};

ui.Action.fromBondAttrs = function (id, attrs, flip, reset)
{
	var action = new ui.Action();

	for (var key in chem.Struct.Bond.attrlist) {
		var value;
		if (key in attrs)
			value = attrs[key];
		else if (reset)
			value = chem.Struct.Bond.attrGetDefault(key);
		else
			continue;
		action.addOp(new ui.Action.OpBondAttr(id, key, value));
	}
	if (flip)
		action.mergeWith(ui.Action.toBondFlipping(id));
	return action.perform();
};

ui.Action.fromSelectedBondsAttrs = function (attrs, flips)
{
	var action = new ui.Action();

	attrs = new Hash(attrs);

	ui.editor.getSelection().bonds.each(function (id) {
		attrs.each(function (attr) {
			action.addOp(new ui.Action.OpBondAttr(id, attr.key, attr.value));
		}, this);
	}, this);
	if (flips)
		flips.each(function (id) {
			action.mergeWith(ui.Action.toBondFlipping(id));
		}, this);
	return action.perform();
};

ui.Action.fromAtomAddition = function (pos, atom)
{
	atom = Object.clone(atom);
	var action = new ui.Action();
	atom.fragment = action.addOp(new ui.Action.OpFragmentAdd().perform(ui.editor)).frid;
	action.addOp(new ui.Action.OpAtomAdd(atom, pos).perform(ui.editor));
	return action;
};

ui.Action.mergeFragments = function (action, frid, frid2) {
	if (frid2 != frid && Object.isNumber(frid2)) {
		var rgid = chem.Struct.RGroup.findRGroupByFragment(ui.render.ctab.molecule.rgroups, frid2);
		if (!Object.isUndefined(rgid)) {
			action.mergeWith(ui.Action.fromRGroupFragment(null, frid2));
		}
		ui.render.ctab.molecule.atoms.each(function (aid, atom) {
			if (atom.fragment == frid2) {
				action.addOp(new ui.Action.OpAtomAttr(aid, 'fragment', frid).perform(ui.editor));
			}
		});
		action.addOp(new ui.Action.OpFragmentDelete(frid2).perform(ui.editor));
	}
};

ui.Action.fromBondAddition = function (bond, begin, end, pos, pos2)
{
	var action = new ui.Action();

	var frid = null;
	if (!Object.isNumber(begin)) {
		if (Object.isNumber(end)) {
			frid = ui.render.atomGetAttr(end, 'fragment');
		}
	}
	else {
		frid = ui.render.atomGetAttr(begin, 'fragment');
		if (Object.isNumber(end)) {
			var frid2 = ui.render.atomGetAttr(end, 'fragment');
			ui.Action.mergeFragments(action, frid, frid2);
		}
	}
	if (frid == null) {
		frid = action.addOp(new ui.Action.OpFragmentAdd().perform(ui.editor)).frid;
	}

	if (!Object.isNumber(begin)) {
		begin.fragment = frid;
		begin = action.addOp(new ui.Action.OpAtomAdd(begin, pos).perform(ui.editor)).data.aid;

		pos = pos2;
	}
	else {
		if (ui.render.atomGetAttr(begin, 'label') == '*') {
			action.addOp(new ui.Action.OpAtomAttr(begin, 'label', 'C').perform(ui.editor));
		}
	}


	if (!Object.isNumber(end)) {
		end.fragment = frid;
		// TODO: <op>.data.aid here is a hack, need a better way to access the id of a newly created atom
		end = action.addOp(new ui.Action.OpAtomAdd(end, pos).perform(ui.editor)).data.aid;
		if (Object.isNumber(begin)) {
			ui.render.atomGetSGroups(begin).each(function (sid) {
				action.addOp(new ui.Action.OpSGroupAtomAdd(sid, end).perform(ui.editor));
			}, this);
		}
	}
	else {
		if (ui.render.atomGetAttr(end, 'label') == '*') {
			action.addOp(new ui.Action.OpAtomAttr(end, 'label', 'C').perform(ui.editor));
		}
	}

	var bid = action.addOp(new ui.Action.OpBondAdd(begin, end, bond).perform(ui.editor)).data.bid;

	action.operations.reverse();

	return [action, begin, end, bid];
};

ui.Action.fromArrowAddition = function (pos)
{
	var action = new ui.Action();
	if (ui.ctab.rxnArrows.count() < 1) {
		action.addOp(new ui.Action.OpRxnArrowAdd(pos).perform(ui.editor));
	}
	return action;
};

ui.Action.fromArrowDeletion = function (id)
{
	var action = new ui.Action();
	action.addOp(new ui.Action.OpRxnArrowDelete(id));
	return action.perform();
};

ui.Action.fromChiralFlagAddition = function (pos)
{
	var action = new ui.Action();
	if (ui.render.ctab.chiralFlags.count() < 1) {
		action.addOp(new ui.Action.OpChiralFlagAdd(pos).perform(ui.editor));
	}
	return action;
};

ui.Action.fromChiralFlagDeletion = function ()
{
	var action = new ui.Action();
	action.addOp(new ui.Action.OpChiralFlagDelete());
	return action.perform();
};

ui.Action.fromPlusAddition = function (pos)
{
	var action = new ui.Action();
	action.addOp(new ui.Action.OpRxnPlusAdd(pos).perform(ui.editor));
	return action;
};

ui.Action.fromPlusDeletion = function (id)
{
	var action = new ui.Action();
	action.addOp(new ui.Action.OpRxnPlusDelete(id));
	return action.perform();
};

// Add action operation to remove atom from s-group if needed
ui.Action.prototype.removeAtomFromSgroupIfNeeded = function (id)
{
	var sgroups = ui.render.atomGetSGroups(id);

	if (sgroups.length > 0)
	{
		sgroups.each(function (sid)
		{
			this.addOp(new ui.Action.OpSGroupAtomRemove(sid, id));
		}, this);

		return true;
	}

	return false;
};

// Add action operations to remove whole s-group if needed
ui.Action.prototype.removeSgroupIfNeeded = function (atoms)
{
	var R = ui.render;
	var RS = R.ctab;
	var DS = RS.molecule;
	var sg_counts = new Hash();

	atoms.each(function (id)
	{
		var sgroups = ui.render.atomGetSGroups(id);

		sgroups.each(function (sid)
		{
			var n = sg_counts.get(sid);
			if (Object.isUndefined(n))
				n = 1;
			else
				n++;
			sg_counts.set(sid, n);
		}, this);
	}, this);

	sg_counts.each(function (sg)
	{
		var sid = parseInt(sg.key);
		var sg_atoms = ui.render.sGroupGetAtoms(sid);

		if (sg_atoms.length == sg.value)
		{ // delete whole s-group
			var sgroup = DS.sgroups.get(sid);
			this.mergeWith(ui.Action.sGroupAttributeAction(sid, sgroup.getAttrs()));
			this.addOp(new ui.Action.OpSGroupRemoveFromHierarchy(sid));
			this.addOp(new ui.Action.OpSGroupDelete(sid));
		}
	}, this);
};

ui.Action.fromAtomDeletion = function (id)
{
	var action = new ui.Action();
	var atoms_to_remove = new Array();

	var frid = ui.ctab.atoms.get(id).fragment;

	ui.render.atomGetNeighbors(id).each(function (nei)
	{
		action.addOp(new ui.Action.OpBondDelete(nei.bid));// [RB] !!
		if (ui.render.atomGetDegree(nei.aid) == 1)
		{
			if (action.removeAtomFromSgroupIfNeeded(nei.aid))
				atoms_to_remove.push(nei.aid);

			action.addOp(new ui.Action.OpAtomDelete(nei.aid));
		}
	}, this);

	if (action.removeAtomFromSgroupIfNeeded(id))
		atoms_to_remove.push(id);

	action.addOp(new ui.Action.OpAtomDelete(id));

	action.removeSgroupIfNeeded(atoms_to_remove);

	action = action.perform();

	action.mergeWith(ui.Action.__fromFragmentSplit(frid));

	return action;
};

ui.Action.fromBondDeletion = function (id)
{
	var action = new ui.Action();
	var bond = ui.ctab.bonds.get(id);
	var frid = ui.ctab.atoms.get(bond.begin).fragment;
	var atoms_to_remove = new Array();

	action.addOp(new ui.Action.OpBondDelete(id));

	if (ui.render.atomGetDegree(bond.begin) == 1)
	{
		if (action.removeAtomFromSgroupIfNeeded(bond.begin))
			atoms_to_remove.push(bond.begin);

		action.addOp(new ui.Action.OpAtomDelete(bond.begin));
	}

	if (ui.render.atomGetDegree(bond.end) == 1)
	{
		if (action.removeAtomFromSgroupIfNeeded(bond.end))
			atoms_to_remove.push(bond.end);

		action.addOp(new ui.Action.OpAtomDelete(bond.end));
	}

	action.removeSgroupIfNeeded(atoms_to_remove);

	action = action.perform();

	action.mergeWith(ui.Action.__fromFragmentSplit(frid));

	return action;
};

ui.Action.__fromFragmentSplit = function (frid) { // TODO [RB] the thing is too tricky :) need something else in future
	var action = new ui.Action();
	var rgid = chem.Struct.RGroup.findRGroupByFragment(ui.ctab.rgroups, frid);
	ui.ctab.atoms.each(function (aid, atom) {
		if (atom.fragment == frid) {
			var newfrid = action.addOp(new ui.Action.OpFragmentAdd().perform(ui.editor)).frid;
			var processAtom = function (aid1) {
				action.addOp(new ui.Action.OpAtomAttr(aid1, 'fragment', newfrid).perform(ui.editor));
				ui.render.atomGetNeighbors(aid1).each(function (nei) {
					if (ui.ctab.atoms.get(nei.aid).fragment == frid) {
						processAtom(nei.aid);
					}
				});
			};
			processAtom(aid);
			if (rgid) {
				action.mergeWith(ui.Action.fromRGroupFragment(rgid, newfrid));
			}
		}
	});
	if (frid != -1) {
		action.mergeWith(ui.Action.fromRGroupFragment(0, frid));
		action.addOp(new ui.Action.OpFragmentDelete(frid).perform(ui.editor));
	}
	return action;
};

ui.Action.fromFragmentAddition = function (atoms, bonds, sgroups, rxnArrows, rxnPluses)
{
	var action = new ui.Action();

	/*
     atoms.each(function (aid)
     {
     ui.render.atomGetNeighbors(aid).each(function (nei)
     {
     if (ui.selection.bonds.indexOf(nei.bid) == -1)
     ui.selection.bonds = ui.selection.bonds.concat([nei.bid]);
     }, this);
     }, this);
     */

	// TODO: merge close atoms and bonds

	sgroups.each(function (sid)
	{
		action.addOp(new ui.Action.OpSGroupRemoveFromHierarchy(sid));
		action.addOp(new ui.Action.OpSGroupDelete(sid));
	}, this);


	bonds.each(function (bid) {
		action.addOp(new ui.Action.OpBondDelete(bid));
	}, this);


	atoms.each(function (aid) {
		action.addOp(new ui.Action.OpAtomDelete(aid));
	}, this);

	rxnArrows.each(function (id) {
		action.addOp(new ui.Action.OpRxnArrowDelete(id));
	}, this);

	rxnPluses.each(function (id) {
		action.addOp(new ui.Action.OpRxnPlusDelete(id));
	}, this);

	action.mergeWith(new ui.Action.__fromFragmentSplit(-1));

	return action;
};

ui.Action.fromFragmentDeletion = function (selection)
{
	selection = selection || ui.editor.getSelection();

	var action = new ui.Action();
	var atoms_to_remove = new Array();

	var frids = [];

	var actionRemoveDataSGroups = new ui.Action();
	if (selection.sgroupData) {
		selection.sgroupData.each(function (id) {
			actionRemoveDataSGroups.mergeWith(ui.Action.fromSgroupDeletion(id));
		}, this);
	}

	selection.atoms.each(function (aid)
	{
		ui.render.atomGetNeighbors(aid).each(function (nei)
		{
			if (selection.bonds.indexOf(nei.bid) == -1)
				selection.bonds = selection.bonds.concat([nei.bid]);
		}, this);
	}, this);

	selection.bonds.each(function (bid)
	{
		action.addOp(new ui.Action.OpBondDelete(bid));

		var bond = ui.ctab.bonds.get(bid);

		if (selection.atoms.indexOf(bond.begin) == -1 && ui.render.atomGetDegree(bond.begin) == 1)
		{
			var frid1 = ui.ctab.atoms.get(bond.begin).fragment;
			if (frids.indexOf(frid1) < 0)
				frids.push(frid1);

			if (action.removeAtomFromSgroupIfNeeded(bond.begin))
				atoms_to_remove.push(bond.begin);

			action.addOp(new ui.Action.OpAtomDelete(bond.begin));
		}
		if (selection.atoms.indexOf(bond.end) == -1 && ui.render.atomGetDegree(bond.end) == 1)
		{
			var frid2 = ui.ctab.atoms.get(bond.end).fragment;
			if (frids.indexOf(frid2) < 0)
				frids.push(frid2);

			if (action.removeAtomFromSgroupIfNeeded(bond.end))
				atoms_to_remove.push(bond.end);

			action.addOp(new ui.Action.OpAtomDelete(bond.end));
		}
	}, this);


	selection.atoms.each(function (aid)
	{
		var frid3 = ui.ctab.atoms.get(aid).fragment;
		if (frids.indexOf(frid3) < 0)
			frids.push(frid3);

		if (action.removeAtomFromSgroupIfNeeded(aid))
			atoms_to_remove.push(aid);

		action.addOp(new ui.Action.OpAtomDelete(aid));
	}, this);

	action.removeSgroupIfNeeded(atoms_to_remove);

	selection.rxnArrows.each(function (id) {
		action.addOp(new ui.Action.OpRxnArrowDelete(id));
	}, this);

	selection.rxnPluses.each(function (id) {
		action.addOp(new ui.Action.OpRxnPlusDelete(id));
	}, this);

	selection.chiralFlags.each(function (id) {
		action.addOp(new ui.Action.OpChiralFlagDelete(id));
	}, this);

	action = action.perform();

	while (frids.length > 0) action.mergeWith(new ui.Action.__fromFragmentSplit(frids.pop()));

	action.mergeWith(actionRemoveDataSGroups);

	return action;
};

ui.Action.fromAtomMerge = function (src_id, dst_id)
{
	var fragAction = new ui.Action();
	var src_frid = ui.render.atomGetAttr(src_id, 'fragment'), dst_frid = ui.render.atomGetAttr(dst_id, 'fragment');
	if (src_frid != dst_frid) {
		ui.Action.mergeFragments(fragAction, src_frid, dst_frid);
	}

	var action = new ui.Action();

	ui.render.atomGetNeighbors(src_id).each(function (nei)
	{
		var bond = ui.ctab.bonds.get(nei.bid);
		var begin, end;

		if (bond.begin == nei.aid) {
			begin = nei.aid;
			end = dst_id;
		} else {
			begin = dst_id;
			end = nei.aid;
		}
		if (dst_id != bond.begin && dst_id != bond.end && ui.ctab.findBondId(begin, end) == -1) // TODO: improve this
		{
			action.addOp(new ui.Action.OpBondAdd(begin, end, bond));
		}
		action.addOp(new ui.Action.OpBondDelete(nei.bid));
	}, this);

	var attrs = chem.Struct.Atom.getAttrHash(ui.ctab.atoms.get(src_id));

	if (ui.render.atomGetDegree(src_id) == 1 && attrs.get('label') == '*')
		attrs.set('label', 'C');

	attrs.each(function (attr) {
		action.addOp(new ui.Action.OpAtomAttr(dst_id, attr.key, attr.value));
	}, this);

	var sg_changed = action.removeAtomFromSgroupIfNeeded(src_id);

	action.addOp(new ui.Action.OpAtomDelete(src_id));

	if (sg_changed)
		action.removeSgroupIfNeeded([src_id]);

	return action.perform().mergeWith(fragAction);
};

ui.Action.toBondFlipping = function (id)
{
	var bond = ui.ctab.bonds.get(id);

	var action = new ui.Action();
	action.addOp(new ui.Action.OpBondDelete(id));
	action.addOp(new ui.Action.OpBondAdd(bond.end, bond.begin, bond)).data.bid = id;
	return action;
};
ui.Action.fromBondFlipping = function (bid) {
	return ui.Action.toBondFlipping(bid).perform();
};

ui.Action.fromTemplateOnCanvas = function (pos, angle, template)
{
	var action = new ui.Action();
	var frag = template.molecule;

	var fragAction = new ui.Action.OpFragmentAdd().perform(ui.editor);

	var map = {};

	// Only template atom label matters for now
	frag.atoms.each(function (aid, atom) {
		var op;
		var attrs = chem.Struct.Atom.getAttrHash(atom).toObject();
		attrs.fragment = fragAction.frid;

		action.addOp(
			op = new ui.Action.OpAtomAdd(
				attrs,
			Vec2.diff(atom.pp, template.xy0).rotate(angle).add(pos)
			).perform(ui.editor)
		);

		map[aid] = op.data.aid;
	});

	frag.bonds.each(function (bid, bond) {
		action.addOp(
		new ui.Action.OpBondAdd(
			map[bond.begin],
			map[bond.end],
			bond
		).perform(ui.editor)
		);
	});

	action.operations.reverse();
	action.addOp(fragAction);

	return action;
};

ui.Action.atomAddToSGroups = function (sgroups, aid) {
	var action = new ui.Action();
	util.each(sgroups, function (sid){
		action.addOp(new ui.Action.OpSGroupAtomAdd(sid, aid).perform(ui.editor));
	}, this);
	return action;
}

ui.Action.fromTemplateOnAtom = function (aid, angle, extra_bond, template, calcAngle)
{
	var action = new ui.Action();
	var frag = template.molecule;
	var R = ui.render;
	var RS = R.ctab;
	var molecule = RS.molecule;
	var atom = molecule.atoms.get(aid);
	var aid0 = aid; // the atom that was clicked on
	var aid1 = null; // the atom on the other end of the extra bond, if any
	var sgroups = ui.render.atomGetSGroups(aid);

	var frid = R.atomGetAttr(aid, 'fragment');

	var map = {};
	var xy0 = frag.atoms.get(template.aid).pp;

	if (extra_bond) {
		// create extra bond after click on atom
		if (angle == null)
		{
			var middle_atom = ui.atomForNewBond(aid);
			var action_res = ui.Action.fromBondAddition({type: 1}, aid, middle_atom.atom, middle_atom.pos);
			action = action_res[0];
			action.operations.reverse();
			aid1 = aid = action_res[2];
		} else {
			var op;

			action.addOp(
				op = new ui.Action.OpAtomAdd(
				{ label: 'C', fragment: frid },
				(new Vec2(1, 0)).rotate(angle).add(atom.pp)
				).perform(ui.editor)
			);

			action.addOp(
			new ui.Action.OpBondAdd(
				aid,
				op.data.aid,
			{ type: 1 }
			).perform(ui.editor)
			);

			aid1 = aid = op.data.aid;
			action.mergeWith(ui.Action.atomAddToSGroups(sgroups, aid));
		}

		var atom0 = atom;
		atom = molecule.atoms.get(aid);
		var delta = calcAngle(atom0.pp, atom.pp) - template.angle0;
	} else {
		if (angle == null) {
			middle_atom = ui.atomForNewBond(aid);
			angle = calcAngle(atom.pp, middle_atom.pos);
		}
		delta = angle - template.angle0;
	}

	frag.atoms.each(function (id, a) {
		var attrs = chem.Struct.Atom.getAttrHash(a).toObject();
		attrs.fragment = frid;
		if (id == template.aid) {
			action.mergeWith(ui.Action.fromAtomsAttrs(aid, attrs, true));
			map[id] = aid;
		} else {
			var v;

			v = Vec2.diff(a.pp, xy0).rotate(delta).add(atom.pp);

			action.addOp(
				op = new ui.Action.OpAtomAdd(
					attrs,
					v
				).perform(ui.editor)
			);
			map[id] = op.data.aid;
		}
		if (map[id] - 0 !== aid0 - 0 && map[id] - 0 !== aid1 - 0)
			action.mergeWith(ui.Action.atomAddToSGroups(sgroups, map[id]));
	});

	frag.bonds.each(function (bid, bond) {
		action.addOp(
		new ui.Action.OpBondAdd(
			map[bond.begin],
			map[bond.end],
			bond
		).perform(ui.editor)
		);
	});

	action.operations.reverse();

	return action;
};

ui.Action.fromTemplateOnBond = function (bid, template, calcAngle, flip)
{
	var action = new ui.Action();
	var frag = template.molecule;
	var R = ui.render;
	var RS = R.ctab;
	var molecule = RS.molecule;

	var bond = molecule.bonds.get(bid);
	var begin = molecule.atoms.get(bond.begin);
	var end = molecule.atoms.get(bond.end);
	var sgroups = Set.list(Set.intersection(
	Set.fromList(ui.render.atomGetSGroups(bond.begin)),
	Set.fromList(ui.render.atomGetSGroups(bond.end))));

	var fr_bond = frag.bonds.get(template.bid);
	var fr_begin;
	var fr_end;

	var frid = R.atomGetAttr(bond.begin, 'fragment');

	var map = {};

	if (flip) {
		fr_begin = frag.atoms.get(fr_bond.end);
		fr_end = frag.atoms.get(fr_bond.begin);
		map[fr_bond.end] = bond.begin;
		map[fr_bond.begin] = bond.end;
	} else {
		fr_begin = frag.atoms.get(fr_bond.begin);
		fr_end = frag.atoms.get(fr_bond.end);
		map[fr_bond.begin] = bond.begin;
		map[fr_bond.end] = bond.end;
	}

	// calc angle
	var angle = calcAngle(begin.pp, end.pp) - calcAngle(fr_begin.pp, fr_end.pp);
	var scale = Vec2.dist(begin.pp, end.pp) / Vec2.dist(fr_begin.pp, fr_end.pp);

	var xy0 = fr_begin.pp;

	frag.atoms.each(function (id, a) {
		var attrs = chem.Struct.Atom.getAttrHash(a).toObject();
		attrs.fragment = frid;
		if (id == fr_bond.begin || id == fr_bond.end) {
			action.mergeWith(ui.Action.fromAtomsAttrs(map[id], attrs, true));
			return;
		}

		var v;

		v = Vec2.diff(a.pp, fr_begin.pp).rotate(angle).scaled(scale).add(begin.pp);

		var merge_a = R.findClosestAtom(v, 0.1);

		if (merge_a == null) {
			var op;
			action.addOp(
				op = new ui.Action.OpAtomAdd(
					attrs,
					v
				).perform(ui.editor)
			);

			map[id] = op.data.aid;
			action.mergeWith(ui.Action.atomAddToSGroups(sgroups, map[id]));
		} else {
			map[id] = merge_a.id;
			action.mergeWith(ui.Action.fromAtomsAttrs(map[id], attrs, true));
			// TODO [RB] need to merge fragments?
		}
	});

	frag.bonds.each(function (id, bond) {
		var exist_id = molecule.findBondId(map[bond.begin], map[bond.end]);
		if (exist_id == -1) {
			action.addOp(
			new ui.Action.OpBondAdd(
				map[bond.begin],
				map[bond.end],
				bond
			).perform(ui.editor));
		} else {
			action.mergeWith(ui.Action.fromBondAttrs(exist_id, fr_bond, false, true));
		}
	});

	action.operations.reverse();

	return action;
}

ui.Action.fromChain = function (p0, v, nSect, atom_id)
{
	var angle = Math.PI / 6;
	var dx = Math.cos(angle), dy = Math.sin(angle);

	var action = new ui.Action();

	var frid;
	if (atom_id != null) {
		frid = ui.render.atomGetAttr(atom_id, 'fragment');
	} else {
		frid = action.addOp(new ui.Action.OpFragmentAdd().perform(ui.editor)).frid;
	}

	var id0 = -1;
	if (atom_id != null) {
		id0 = atom_id;
	} else {
		id0 = action.addOp(new ui.Action.OpAtomAdd({label: 'C', fragment: frid}, p0).perform(ui.editor)).data.aid;
	}

	action.operations.reverse();

	nSect.times(function (i) {
		var pos = new Vec2(dx * (i + 1), i & 1 ? 0 : dy).rotate(v).add(p0);

		var a = ui.render.findClosestAtom(pos, 0.1);

		var ret = ui.Action.fromBondAddition({}, id0, a ? a.id : {}, pos);
		action = ret[0].mergeWith(action);
		id0 = ret[2];
	}, this);

	return action;
};

ui.Action.fromNewCanvas = function (ctab)
{
	var action = new ui.Action();

	action.addOp(new ui.Action.OpCanvasLoad(ctab));
	return action.perform();
};

ui.Action.fromSgroupType = function (id, type)
{
	var R = ui.render;
	var cur_type = R.sGroupGetType(id);
	if (type && type != cur_type) {
		var atoms = util.array(R.sGroupGetAtoms(id));
		var attrs = R.sGroupGetAttrs(id);
		var actionDeletion = ui.Action.fromSgroupDeletion(id); // [MK] order of execution is important, first delete then recreate
		var actionAddition = ui.Action.fromSgroupAddition(type, atoms, attrs, id);
		return actionAddition.mergeWith(actionDeletion); // the actions are already performed and reversed, so we merge them backwards
	}
	return new ui.Action();
};

ui.Action.fromSgroupAttrs = function (id, attrs)
{
	var action = new ui.Action();
	var R = ui.render;
	var RS = R.ctab;
	var sg = RS.sgroups.get(id).item;

	new Hash(attrs).each(function (attr) {
		action.addOp(new ui.Action.OpSGroupAttr(id, attr.key, attr.value));
	}, this);

	return action.perform();
};

ui.Action.sGroupAttributeAction = function (id, attrs)
{
	var action = new ui.Action();

	new Hash(attrs).each(function (attr) { // store the attribute assignment
		action.addOp(new ui.Action.OpSGroupAttr(id, attr.key, attr.value));
	}, this);

	return action;
};

ui.Action.fromSgroupDeletion = function (id)
{
	var action = new ui.Action();
	var R = ui.render;
	var RS = R.ctab;
	var DS = RS.molecule;

	if (ui.render.sGroupGetType(id) == 'SRU') {
		ui.render.sGroupsFindCrossBonds();
		var nei_atoms = ui.render.sGroupGetNeighborAtoms(id);

		nei_atoms.each(function (aid) {
			if (ui.render.atomGetAttr(aid, 'label') == '*') {
				action.addOp(new ui.Action.OpAtomAttr(aid, 'label', 'C'));
			}
		}, this);
	}

	var sg = DS.sgroups.get(id);
	var atoms = chem.SGroup.getAtoms(DS, sg);
	var attrs = sg.getAttrs();
	action.addOp(new ui.Action.OpSGroupRemoveFromHierarchy(id));
	for (var i = 0; i < atoms.length; ++i) {
		action.addOp(new ui.Action.OpSGroupAtomRemove(id, atoms[i]));
	}
	action.addOp(new ui.Action.OpSGroupDelete(id));

	action = action.perform();

	action.mergeWith(ui.Action.sGroupAttributeAction(id, attrs));

	return action;
};

ui.Action.fromSgroupAddition = function (type, atoms, attrs, sgid, pp)
{
	var action = new ui.Action();
	var i;

	// TODO: shoud the id be generated when OpSGroupCreate is executed?
	//      if yes, how to pass it to the following operations?
	sgid = sgid - 0 === sgid ? sgid : ui.render.ctab.molecule.sgroups.newId();

	action.addOp(new ui.Action.OpSGroupCreate(sgid, type, pp));
	for (i = 0; i < atoms.length; i++)
		action.addOp(new ui.Action.OpSGroupAtomAdd(sgid, atoms[i]));
	action.addOp(new ui.Action.OpSGroupAddToHierarchy(sgid));

	action = action.perform();

	if (type == 'SRU') {
		ui.render.sGroupsFindCrossBonds();
		var asterisk_action = new ui.Action();
		ui.render.sGroupGetNeighborAtoms(sgid).each(function (aid) {
			if (ui.render.atomGetDegree(aid) == 1 && ui.render.atomIsPlainCarbon(aid)) {
				asterisk_action.addOp(new ui.Action.OpAtomAttr(aid, 'label', '*'));
			}
		}, this);

		asterisk_action = asterisk_action.perform();
		asterisk_action.mergeWith(action);
		action = asterisk_action;
	}

	return ui.Action.fromSgroupAttrs(sgid, attrs).mergeWith(action);
};

ui.Action.fromRGroupAttrs = function (id, attrs) {
	var action = new ui.Action();
	new Hash(attrs).each(function (attr) {
		action.addOp(new ui.Action.OpRGroupAttr(id, attr.key, attr.value));
	}, this);
	return action.perform();
};

ui.Action.fromRGroupFragment = function (rgidNew, frid) {
	var action = new ui.Action();
	action.addOp(new ui.Action.OpRGroupFragment(rgidNew, frid));
	return action.perform();
};

ui.Action.fromPaste = function (objects, offset) {
	offset = offset || new Vec2();
	var action = new ui.Action(), amap = {}, fmap = {};
	// atoms
	for (var aid = 0; aid < objects.atoms.length; aid++) {
		var atom = Object.clone(objects.atoms[aid]);
		if (!(atom.fragment in fmap)) {
			fmap[atom.fragment] = action.addOp(new ui.Action.OpFragmentAdd().perform(ui.editor)).frid;
		}
		atom.fragment = fmap[atom.fragment];
		amap[aid] = action.addOp(new ui.Action.OpAtomAdd(atom, atom.pp.add(offset)).perform(ui.editor)).data.aid;
	}

	var rgnew = [];
	for (var rgid in ui.clipboard.rgroups) {
		if (!ui.ctab.rgroups.has(rgid)) {
			rgnew.push(rgid);
		}
	}

	// assign fragments to r-groups
	for (var frid in ui.clipboard.rgmap) {
		action.addOp(new ui.Action.OpRGroupFragment(ui.clipboard.rgmap[frid], fmap[frid]).perform(ui.editor));
	}

	for (var i = 0; i < rgnew.length; ++i) {
		action.mergeWith(ui.Action.fromRGroupAttrs(rgnew[i], ui.clipboard.rgroups[rgnew[i]]));
	}

	//bonds
	for (var bid = 0; bid < objects.bonds.length; bid++) {
		var bond = Object.clone(objects.bonds[bid]);
		action.addOp(new ui.Action.OpBondAdd(amap[bond.begin], amap[bond.end], bond).perform(ui.editor));
	}
	//sgroups
	for (var sgid = 0; sgid < objects.sgroups.length; sgid++) {
		var sgroup_info = objects.sgroups[sgid];
		var atoms = sgroup_info.atoms;
		var sgatoms = [];
		for (var sgaid = 0; sgaid < atoms.length; sgaid++) {
			sgatoms.push(amap[atoms[sgaid]]);
		}
		var newsgid = ui.render.ctab.molecule.sgroups.newId();
		var sgaction = ui.Action.fromSgroupAddition(sgroup_info.type, sgatoms, sgroup_info.attrs, newsgid, sgroup_info.pp ? sgroup_info.pp.add(offset) : null);
		for (var iop = sgaction.operations.length - 1; iop >= 0; iop--) {
			action.addOp(sgaction.operations[iop]);
		}
	}
	//reaction arrows
	if (ui.editor.render.ctab.rxnArrows.count() < 1) {
		for (var raid = 0; raid < objects.rxnArrows.length; raid++) {
			action.addOp(new ui.Action.OpRxnArrowAdd(objects.rxnArrows[raid].pp.add(offset)).perform(ui.editor));
		}
	}
	//reaction pluses
	for (var rpid = 0; rpid < objects.rxnPluses.length; rpid++) {
		action.addOp(new ui.Action.OpRxnPlusAdd(objects.rxnPluses[rpid].pp.add(offset)).perform(ui.editor));
	}
	//thats all
	action.operations.reverse();
	return action;
};

ui.Action.fromFlip = function (objects, flip) {
	var render = ui.render;
	var ctab = render.ctab;
	var molecule = ctab.molecule;

	var action = new ui.Action();
	var i;
	var fids = {};

	if (objects.atoms) {
		for (i = 0; i < objects.atoms.length; i++) {
			var aid = objects.atoms[i];
			var atom = molecule.atoms.get(aid);
			if (!(atom.fragment in fids)) {
				fids[atom.fragment] = [aid];
			} else {
				fids[atom.fragment].push(aid);
			}
		}

		fids = new Hash(fids);

		if (fids.detect(function (frag) {
			return !Set.eq(molecule.getFragmentIds(frag[0]), Set.fromList(frag[1]));
		})) {
			return action; // empty action
		}

		fids.each(function (frag) {
			var fragment = Set.fromList(frag[1]);
			//var x1 = 100500, x2 = -100500, y1 = 100500, y2 = -100500;
			var bbox = molecule.getCoordBoundingBox(fragment);

			Set.each(fragment, function (aid) {
				var atom = molecule.atoms.get(aid);
				var d = new Vec2();

				if (flip == 'horizontal') {
					d.x = bbox.min.x + bbox.max.x - 2 * atom.pp.x;
				} else { // 'vertical'
					d.y = bbox.min.y + bbox.max.y - 2 * atom.pp.y;
				}

				action.addOp(new ui.Action.OpAtomMove(aid, d));
			});
		});

		if (objects.bonds) {
			for (i = 0; i < objects.bonds.length; i++) {
				var bid = objects.bonds[i];
				var bond = molecule.bonds.get(bid);

				if (bond.type == chem.Struct.BOND.TYPE.SINGLE) {
					if (bond.stereo == chem.Struct.BOND.STEREO.UP) {
						action.addOp(new ui.Action.OpBondAttr(bid, 'stereo', chem.Struct.BOND.STEREO.DOWN));
					} else if (bond.stereo == chem.Struct.BOND.STEREO.DOWN) {
						action.addOp(new ui.Action.OpBondAttr(bid, 'stereo', chem.Struct.BOND.STEREO.UP));
					}
				}
			}
		}
	}

	return action.perform();
};

ui.Action.fromRotate = function (objects, pos, angle) {
	var render = ui.render;
	var ctab = render.ctab;
	var molecule = ctab.molecule;

	var action = new ui.Action();
	var i;
	var fids = {};

	function rotateDelta(v)
	{
		var v1 = v.sub(pos);
		v1 = v1.rotate(angle);
		v1.add_(pos);
		return v1.sub(v);
	}

	if (objects.atoms) {
		objects.atoms.each(function (aid) {
			var atom = molecule.atoms.get(aid);
			action.addOp(new ui.Action.OpAtomMove(aid, rotateDelta(atom.pp)));
		});
	}

	if (objects.rxnArrows) {
		objects.rxnArrows.each(function (aid) {
			var arrow = molecule.rxnArrows.get(aid);
			action.addOp(new ui.Action.OpRxnArrowMove(aid, rotateDelta(arrow.pp)));
		});
	}

	if (objects.rxnPluses) {
		objects.rxnPluses.each(function (pid) {
			var plus = molecule.rxnPluses.get(pid);
			action.addOp(new ui.Action.OpRxnPlusMove(pid, rotateDelta(plus.pp)));
		});
	}

	if (objects.sgroupData) {
		objects.sgroupData.each(function (did) {
			var data = molecule.sgroups.get(did);
			action.addOp(new ui.Action.OpSGroupDataMove(did, rotateDelta(data.pp)));
		});
	}

	if (objects.chiralFlags) {
		objects.chiralFlags.each(function (fid) {
			var flag = molecule.chiralFlags.get(fid);
			action.addOp(new ui.Action.OpChiralFlagMove(fid, rotateDelta(flag.pp)));
		});
	}

	return action.perform();
};

ui.addUndoAction = function (action, check_dummy)
{
	if (action == null)
		return;

	if (check_dummy != true || !action.isDummy())
	{
		ui.undoStack.push(action);
		ui.redoStack.clear();
		if (ui.undoStack.length > ui.HISTORY_LENGTH)
			ui.undoStack.splice(0, 1);
		ui.updateHistoryButtons();
		ui.actionComplete();
	}
};

ui.removeDummyAction = function ()
{
	if (ui.undoStack.length != 0 && ui.undoStack.last().isDummy())
	{
		ui.undoStack.pop();
		ui.updateHistoryButtons();
	}
};
