import { Controller, Get } from '@nestjs/common';
import { appConfig } from '@chatbox/config';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      ok: true,
      service: appConfig.productName,
      timestamp: new Date().toISOString(),
    };
  }
}
