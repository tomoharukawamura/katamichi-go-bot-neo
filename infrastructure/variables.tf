variable "aws_region" {
  default = "ap-northeast-1"
}

variable "project" {
  default = "katamichi-go-bot"
}

variable "vpc_cidr" {
  default = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  default = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "ecr_repository_name" {
  default = "katamichi-go-bot/get-cars-fargate"
}

variable "container_image" {
  description = "Full ECR image URI (set after first push)"
  default     = ""
}

variable "interval_seconds" {
  default = "5"
}
