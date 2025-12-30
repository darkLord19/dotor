import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from '@dotor/logger';
import { HTTP_STATUS } from '@dotor/shared';
import { z } from 'zod';
import { GoogleService } from '../services/google.service.js';
import { ValidationError } from '../lib/errors/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getEnv } from '../lib/env/index.js';

const callbackSchema = z.object({
  code: z.string(),
  state: z.string(),
});

export class GoogleController {
  private googleService: GoogleService;

  constructor(logger: Logger) {
    this.googleService = new GoogleService(logger);
  }

  async getAllConnections(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authRequest = request as AuthenticatedRequest;

    try {
      const connections = await this.googleService.getAllConnections(
        authRequest.userId,
        authRequest.accessToken
      );
      await reply.code(HTTP_STATUS.OK).send(connections);
    } catch (error) {
      if (error instanceof Error) {
        await reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({ error: error.message });
      } else {
        await reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({ error: 'Failed to fetch connections' });
      }
    }
  }

  async getGoogleStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authRequest = request as AuthenticatedRequest;

    try {
      const status = await this.googleService.getGoogleStatus(
        authRequest.userId,
        authRequest.accessToken
      );
      await reply.code(HTTP_STATUS.OK).send(status);
    } catch (error) {
      if (error instanceof Error) {
        await reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({ error: error.message });
      } else {
        await reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({ error: 'Failed to fetch connection status' });
      }
    }
  }

  async getAuthUrl(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authRequest = request as AuthenticatedRequest;

    try {
      const authUrl = this.googleService.getAuthUrl(authRequest.userId);
      await reply.code(HTTP_STATUS.OK).send({ url: authUrl });
    } catch (error) {
      await reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({ error: 'Failed to generate auth URL' });
    }
  }

  async handleCallback(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parseResult = callbackSchema.safeParse(request.query);

    if (!parseResult.success) {
      throw new ValidationError('Invalid callback parameters', parseResult.error.issues);
    }

    const { code, state } = parseResult.data;
    const env = getEnv();
    const redirectUrl = env.WEBAPP_URL;

    try {
      await this.googleService.handleOAuthCallback(code, state);
      await reply.redirect(`${redirectUrl}/ask?google_connected=true`);
    } catch (error) {
      await reply.redirect(`${redirectUrl}/ask?google_error=true`);
    }
  }

  async disconnect(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authRequest = request as AuthenticatedRequest;

    try {
      await this.googleService.disconnect(authRequest.userId, authRequest.accessToken);
      await reply.code(HTTP_STATUS.OK).send({ success: true });
    } catch (error) {
      if (error instanceof Error) {
        await reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({ error: error.message });
      } else {
        await reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({ error: 'Failed to disconnect' });
      }
    }
  }
}
