# ============================================================
# init-db (Lambda container)
# ============================================================

# --- ECR ---
resource "aws_ecr_repository" "init_db" {
  name                 = "${var.project}/init-db"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

# --- IAM: Lambda Execution Role ---
resource "aws_iam_role" "lambda_init_db" {
  name = "${var.project}-lambda-init-db"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_init_db.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "dynamodb-access"
  role = aws_iam_role.lambda_init_db.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "dynamodb:*"
      Resource = "arn:aws:dynamodb:${var.aws_region}:*:table/${var.project}*"
    }]
  })
}

# --- CloudWatch Logs ---
resource "aws_cloudwatch_log_group" "init_db" {
  name              = "/aws/lambda/${var.project}-init-db"
  retention_in_days = 30
}

# --- Seed image (dummy) ---
resource "null_resource" "init_db_seed_image" {
  depends_on = [aws_ecr_repository.init_db]

  provisioner "local-exec" {
    interpreter = ["bash", "-c"]
    command     = <<-EOT
      set -e
      REPO_URL="${aws_ecr_repository.init_db.repository_url}"
      aws ecr get-login-password --region ${var.aws_region} \
        | docker login --username AWS --password-stdin "$(echo $REPO_URL | cut -d/ -f1)"
      # Check if image already exists
      if aws ecr describe-images --repository-name "${aws_ecr_repository.init_db.name}" --image-ids imageTag=latest --region ${var.aws_region} 2>/dev/null; then
        echo "Image already exists, skipping seed."
        exit 0
      fi
      TMPDIR=$(mktemp -d)
      cat > "$TMPDIR/Dockerfile" <<'DF'
      FROM public.ecr.aws/lambda/nodejs:22
      CMD ["index.handler"]
      DF
      DOCKER_BUILDKIT=1 docker build --provenance=false -t "$REPO_URL:latest" "$TMPDIR"
      docker push "$REPO_URL:latest"
      rm -rf "$TMPDIR"
    EOT
  }

  lifecycle {
    ignore_changes = all
  }
}

# --- Lambda Function ---
resource "aws_lambda_function" "init_db" {
  depends_on    = [null_resource.init_db_seed_image]
  function_name = "${var.project}-init-db"
  role          = aws_iam_role.lambda_init_db.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.init_db.repository_url}:latest"
  timeout       = 60
  memory_size   = 256

  environment {
    variables = {
      TZ = "Asia/Tokyo"
    }
  }
}

# --- IAM: Scheduler Role ---
resource "aws_iam_role" "scheduler_lambda" {
  name = "${var.project}-scheduler-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "scheduler_lambda_invoke" {
  name = "lambda-invoke"
  role = aws_iam_role.scheduler_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = aws_lambda_function.init_db.arn
    }]
  })
}

# --- EventBridge Scheduler: 毎日 JST 6:50 に実行 ---
resource "aws_scheduler_schedule" "init_db" {
  name       = "${var.project}-init-db"
  group_name = aws_scheduler_schedule_group.main.name

  schedule_expression          = "cron(50 6 * * ? *)"
  schedule_expression_timezone = "Asia/Tokyo"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.init_db.arn
    role_arn = aws_iam_role.scheduler_lambda.arn
  }
}
