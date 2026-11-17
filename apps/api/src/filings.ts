import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { AuthRequest } from "./auth.guard";
import { FilingsService } from "./filings.service";
import { FilingDto, EditDto, TransitionDto, ListDto } from "./filing.dto";
@Controller("filings")
export class FilingsController {
  constructor(private filings: FilingsService) {}
  @Get() list(@Req() r: AuthRequest, @Query() q: ListDto) {
    return this.filings.list(r.actor, q);
  }
  @Get("summary") summary(@Req() r: AuthRequest) {
    return this.filings.summary(r.actor);
  }
  @Get(":id") detail(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.filings.detail(r.actor, id);
  }
  @Post() create(@Req() r: AuthRequest, @Body() d: FilingDto) {
    return this.filings.create(r.actor, d);
  }
  @Patch(":id") edit(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: EditDto,
  ) {
    return this.filings.edit(r.actor, id, d);
  }
  @Post(":id/transitions") transition(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() d: TransitionDto,
  ) {
    return this.filings.transition(r.actor, id, d);
  }
}
