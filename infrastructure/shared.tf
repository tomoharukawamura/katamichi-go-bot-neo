resource "aws_ecs_cluster" "main" {
  name = var.project
}

resource "aws_scheduler_schedule_group" "main" {
  name = var.project
}

# --- DynamoDB ---
resource "aws_dynamodb_table" "cars" {
  name         = "Cars"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "carName"

  attribute {
    name = "carName"
    type = "S"
  }
}

resource "aws_dynamodb_table" "html_cache" {
  name         = "HtmlCache"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "url"

  attribute {
    name = "url"
    type = "S"
  }
}
