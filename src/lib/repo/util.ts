import { z } from "zod";
export const isUuid = (v: string) => z.string().uuid().safeParse(v).success;
