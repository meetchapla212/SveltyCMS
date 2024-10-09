/**
 * @file src/routes/api/user/editToken/+server.ts
 * @description API endpoint for editing a user token.
 *
 * This module provides functionality to:
 * - Update the data associated with a specific token
 *
 * Features:
 * - Token data modification
 * - Permission checking
 * - Input validation
 * - Error handling and logging
 *
 * Usage:
 * PUT /api/user/editToken
 * Body: JSON object with 'tokenId' and 'newTokenData' properties
 *
 * Note: This endpoint is secured with appropriate authentication and authorization.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

// Auth
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';
import { permissionCheck } from '@src/auth/permissionCheck';

// System Logger
import { logger } from '@utils/logger';

// Input validation
import { z } from 'zod';

const editTokenSchema = z.object({
	tokenId: z.string(),
	newTokenData: z.object({
		email: z.string().email().optional(),
		expires: z.date().optional(),
		type: z.string().optional()
	})
});

export const PUT: RequestHandler = async ({ request, locals }) => {
	try {
		// Check if the user has permission to edit tokens
		const hasPermission = await permissionCheck(locals.user, {
			contextId: 'config/userManagement',
			requiredRole: 'admin',
			action: 'manage',
			contextType: 'system'
		});

		if (!hasPermission) {
			throw error(403, 'Unauthorized to edit registration tokens');
		}

		const body = await request.json();

		// Validate input
		const validatedData = editTokenSchema.parse(body);

		const tokenAdapter = new TokenAdapter();

		// Update the token
		await tokenAdapter.updateToken(validatedData.tokenId, validatedData.newTokenData);

		logger.info('Token updated successfully', {
			tokenId: validatedData.tokenId,
			newData: validatedData.newTokenData
		});

		return json({
			success: true,
			message: 'Token updated successfully'
		});
	} catch (err) {
		if (err instanceof z.ZodError) {
			logger.warn('Invalid input for editToken API:', err.errors);
			throw error(400, 'Invalid input: ' + err.errors.map((e) => e.message).join(', '));
		}
		logger.error('Error in editToken API:', err);
		throw error(500, 'Failed to update token');
	}
};
