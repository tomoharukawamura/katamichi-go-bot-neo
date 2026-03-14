output "ecr_repository_url" {
  value = aws_ecr_repository.get_cars.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  value = aws_ecs_service.get_cars.name
}

output "vpc_id" {
  value = aws_vpc.main.id
}

output "github_actions_role_arn" {
  value = aws_iam_role.github_actions.arn
}

output "sns_topic_error_arn" {
  value = aws_sns_topic.error.arn
}

output "sns_topic_slack_error_arn" {
  value = aws_sns_topic.slack_error.arn
}
