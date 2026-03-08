variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "prod"
}

variable "project" {
  description = "Project name used as a name prefix"
  type        = string
  default     = "katab"
}

variable "db_username" {
  description = "KCP database username"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "KCP database password"
  type        = string
  sensitive   = true
}

variable "image_tag" {
  description = "Docker image tag for the KCP container"
  type        = string
  default     = "latest"
}
