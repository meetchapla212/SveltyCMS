/**
 * @file src/components/widgets/richText/index.ts
 * @description - richText TipTap index file.
 */

const WIDGET_NAME = 'RichText' as const;

import { publicEnv } from '@root/config/public';
import { getFieldName, getGuiFields } from '@utils/utils';
import { MediaService } from '@utils/media/MediaService'; // Import the MediaService class
import { GuiSchema, toString, GraphqlSchema, type Params } from './types';
import type { ModifyRequestParams } from '..';
import { dbAdapter } from '@src/databases/db'; // Import your database adapter

// ParaglideJS
import * as m from '@src/paraglide/messages';

const mediaService = new MediaService(); // Initialize MediaService instance

/**
 * Defines RichText widget Parameters
 */
const widget = (params: Params) => {
	// Define the display function
	let display: any;

	if (!params.display) {
		display = async ({ data, contentLanguage }) => {
			data = data ? data : {}; // Ensure data is not undefined
			return params.translated ? data[contentLanguage] || m.widgets_nodata() : data[publicEnv.DEFAULT_CONTENT_LANGUAGE] || m.widgets_nodata();
		};
		display.default = true;
	} else {
		display = params.display;
	}

	// Define the widget object
	const widget = {
		Name: WIDGET_NAME,
		GuiFields: getGuiFields(params, GuiSchema)
	};

	// Define the field object
	const field = {
		// default fields
		display,
		label: params.label,
		db_fieldName: params.db_fieldName,
		translated: params.translated,
		required: params.required,
		icon: params.icon,
		width: params.width,
		helper: params.helper,

		// permissions
		permissions: params.permissions

		//extra
		// media_folder: params.media_folder
	};

	// Return the field and widget objects
	return { ...field, widget };
};

widget.modifyRequest = async ({ data, type, collection, id, meta_data, user }: ModifyRequestParams<typeof widget>) => {
	if (!dbAdapter) {
		throw Error('Database adapter is not initialized.');
	}

	switch (type) {
		case 'POST':
		case 'PATCH': {
			const images = data.get().images;
			const _data = data.get().data;
			let _id;

			for (const id of (_data.content['en'] as string).matchAll(/media_image="(.+?)"/gms)) {
				// Images from richtext content itself
				images[id[1]] = id[1];
			}

			for (const img_id in images) {
				if (images[img_id] instanceof File) {
					// Locally selected new images
					const res = await mediaService.saveMedia(images[img_id], user._id); // Use MediaService to save image
					const fileInfo = res.fileInfo;
					_id = res._id;
					for (const lang in _data.content) {
						_data.content[lang] = _data.content[lang].replace(`src="${img_id}"`, `src="${fileInfo.original.url}" media_image="${_id}"`);
					}
				} else {
					// Selected from Media images
					_id = images[img_id];
				}
				if (meta_data?.media_images?.removed && _id) {
					const removed = meta_data?.media_images?.removed as string[];
					let index = removed.indexOf(_id.toString());

					while (index != -1) {
						removed.splice(index, 1);
						index = removed.indexOf(_id.toString());
					}
				}

				await dbAdapter.updateOne('media_images', { _id }, { $addToSet: { used_by: id } });
			}
			data.update(_data);
			break;
		}
		case 'DELETE': {
			await dbAdapter.updateMany('media_images', {}, { $pull: { used_by: id } });
			break;
		}
	}
};

// Assign Name, GuiSchema and GraphqlSchema to the widget function
widget.Name = WIDGET_NAME;
widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;
widget.toString = toString;

// Widget icon and helper text
widget.Icon = 'icon-park-outline:text';
widget.Description = m.widget_text_description();

/**
 * Widget Aggregations
 */
widget.aggregations = {
	filters: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		return [
			{
				$match: {
					[`${getFieldName(field)}.header.${info.contentLanguage}`]: {
						$regex: info.filter,
						$options: 'i'
					}
				}
			}
		];
	},
	sorts: async (info) => {
		const field = info.field as ReturnType<typeof widget>;
		const fieldName = getFieldName(field);
		return [{ $sort: { [`${fieldName}.${info.contentLanguage}`]: info.sort } }];
	}
} as Aggregations;

// Export FieldType interface and widget function
export interface FieldType extends ReturnType<typeof widget> {}
export default widget;
