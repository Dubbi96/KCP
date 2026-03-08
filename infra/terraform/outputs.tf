output "kcp_service_name" {
  description = "Name of the KCP ECS service"
  value       = aws_ecs_service.kcp.name
}

output "kcp_alb_dns" {
  description = "ALB DNS name for reaching KCP (managed by KCD infra)"
  value       = data.terraform_remote_state.kcd.outputs.kcp_alb_dns
}
