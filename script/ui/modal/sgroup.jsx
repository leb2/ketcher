import { h } from 'preact';
import { connect } from 'preact-redux';
/** @jsx h */

import {sgroup as sgroupSchema} from '../structschema';
import {form as Form, Field, mapOf} from '../component/form';
import Dialog from '../component/dialog';

const schemes = mapOf(sgroupSchema, 'type');

function SelectOneOf(props, {stateStore}) {
	const {name, ...prop} = props;

	const selectDesc = {
		title: 'Type',
		enum: [],
		enumNames: []
	};

	Object.keys(schemes).forEach((item) => {
		selectDesc.enum.push(item);
		selectDesc.enumNames.push(schemes[item].title);
	});

	return <Field name={name} schema={selectDesc}
				  {...stateStore.field(name)} {...prop}/>;
}

function Sgroup(props) {
	let {stateForm, ...prop} = props;
	let type = stateForm.type;
	return (
		<Form storeName="sgroup" component={Dialog} title="S-Group Properties" className="sgroup"
			  schema={schemes[type]} init={prop} params={prop}>
			<SelectOneOf name="type"/>
			<fieldset class={type === 'DAT' ? 'data' : 'base'}>
				{ content(type) }
			</fieldset>
		</Form>
	);
}

const content = type => Object.keys(schemes[type].properties)
	.filter(prop => prop !== 'type')
	.map(prop => {
			let props = {};
			if (prop === 'name') props.maxlength = 15;
			if (prop === 'fieldName') props.maxlength = 30;
			if (prop === 'fieldValue') props.type = 'textarea';
			if (prop === 'radiobuttons') props.type = 'radio';

			return <Field name={prop} key={`${type}-${prop}`} {...props}/>;
		}
	);

export default connect((store) => {
	return {
		stateForm: store.sgroup.stateForm
	};
})(Sgroup);