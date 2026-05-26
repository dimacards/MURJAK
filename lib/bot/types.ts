import type { Context } from "grammy";
import type { Worker } from "@prisma/client";

/**
 * Расширенный контекст grammY с полем `worker`.
 *
 * `worker` устанавливается middleware `whitelist` на каждое обновление.
 * Все обработчики, регистрируемые ПОСЛЕ whitelist, могут полагаться, что
 * `ctx.worker` существует (иначе whitelist не передал бы управление).
 *
 * Эквивалент `ctx.state.worker` из Express-подобных фреймворков — в grammY
 * `state` не зарезервирован, поэтому кладём напрямую в `ctx`.
 */
export type AppContext = Context & {
  worker: Worker;
};
