import { RegistryController } from "./registry/registry.controller";
import { RegistryWorker } from "./registry/registry.worker";
import { RegistryDatabase } from "./registry/registry.database";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { FilingsController } from "./filings/filings.controller";
import { FilingsService } from "./filings/filings.service";
import { Database } from "./database/database";
import { TenantsController } from "./tenants/tenants.controller";
import { TenantsService } from "./tenants/tenants.service";
import { RolesGuard } from "./auth/roles.guard";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { AuthGuard } from "./auth/auth.guard";
import { HealthController } from "./health/health.controller";
@Module({
  controllers: [
    HealthController,
    RegistryController,
    AuthController,
    TenantsController,
    FilingsController,
  ],
  providers: [
    Database,
    RegistryDatabase,
    RegistryWorker,
    AuthService,
    RolesGuard,
    TenantsService,
    FilingsService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
