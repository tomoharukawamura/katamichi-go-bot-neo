# ============================================================
# get-cars (ECS Fargate)
# ============================================================

# --- ECR ---
resource "aws_ecr_repository" "get_cars" {
  name                 = var.ecr_repository_name
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

# --- IAM: Task Execution Role (ECR pull, CloudWatch Logs) ---
resource "aws_iam_role" "ecs_task_execution" {
  name = "${var.project}-ecs-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# --- IAM: Task Role (DynamoDB) ---
resource "aws_iam_role" "ecs_task" {
  name = "${var.project}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_dynamodb" {
  name = "dynamodb-access"
  role = aws_iam_role.ecs_task.id

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
resource "aws_cloudwatch_log_group" "get_cars" {
  name              = "/ecs/${var.project}/get-cars-fargate"
  retention_in_days = 30
}

# --- ECS Task Definition & Service ---
resource "aws_ecs_task_definition" "get_cars" {
  family                   = "get-cars-fargate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "get-cars"
    image     = var.container_image != "" ? var.container_image : "${aws_ecr_repository.get_cars.repository_url}:latest"
    essential = true

    environment = [
      { name = "INTERVAL_SECONDS", value = var.interval_seconds },
      { name = "TZ", value = "Asia/Tokyo" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.get_cars.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

resource "aws_ecs_service" "get_cars" {
  name            = "get-cars-fargate"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.get_cars.arn
  desired_count   = 0
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.fargate.id]
    assign_public_ip = true
  }

  lifecycle {
    ignore_changes = [desired_count]
  }
}

# --- IAM: Scheduler Role ---
resource "aws_iam_role" "scheduler_ecs" {
  name = "${var.project}-scheduler-ecs"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "scheduler_ecs" {
  name = "ecs-update-service"
  role = aws_iam_role.scheduler_ecs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "ecs:UpdateService"
      Resource = aws_ecs_service.get_cars.id
    }]
  })
}

# --- EventBridge Scheduler: 毎日 JST 7:00 起動 / 22:00 停止 ---
resource "aws_scheduler_schedule" "start" {
  name       = "${var.project}-get-cars-start"
  group_name = aws_scheduler_schedule_group.main.name

  schedule_expression          = "cron(0 7 * * ? *)"
  schedule_expression_timezone = "Asia/Tokyo"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:ecs:updateService"
    role_arn = aws_iam_role.scheduler_ecs.arn

    input = jsonencode({
      Cluster      = aws_ecs_cluster.main.name
      Service      = aws_ecs_service.get_cars.name
      DesiredCount = 1
    })
  }
}

resource "aws_scheduler_schedule" "stop" {
  name       = "${var.project}-get-cars-stop"
  group_name = aws_scheduler_schedule_group.main.name

  schedule_expression          = "cron(0 22 * * ? *)"
  schedule_expression_timezone = "Asia/Tokyo"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:ecs:updateService"
    role_arn = aws_iam_role.scheduler_ecs.arn

    input = jsonencode({
      Cluster      = aws_ecs_cluster.main.name
      Service      = aws_ecs_service.get_cars.name
      DesiredCount = 0
    })
  }
}
