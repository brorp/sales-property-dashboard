UPDATE "lead"
SET "result_status" = 'reserve',
    "updated_at" = now()
WHERE lower(coalesce("result_status", '')) = 'on_process';
--> statement-breakpoint
UPDATE "lead"
SET "result_status" = 'lunas',
    "updated_at" = now()
WHERE lower(coalesce("result_status", '')) = 'akad';
--> statement-breakpoint
UPDATE "lead"
SET "result_status" = 'cancel_full_book',
    "updated_at" = now()
WHERE lower(coalesce("result_status", '')) IN ('cancel', 'cancel_transaksi');
